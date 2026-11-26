require 'csv'
require 'date'
require 'time'
require 'bigdecimal'
require 'sequel'
require 'sequel/extensions/inflector'

server = File.realpath(File.join(__dir__, 'app/server'))
abort "Run this importer in #{server}" unless Dir.pwd == server
$LOAD_PATH.unshift(File.join(server, 'src'))
$SERVER_NAME = 'legacy-build-import'
require 'unlight'

db = Unlight::DB
expected_db = File.join(server, 'data/game_dev2.db')
abort "Unexpected SQLite database #{db.opts[:database]}" unless db.opts[:database] == expected_db

language_suffix = /_(?:tcn|en|scn|kr|fr|ina|thai)\z/
sources_by_locale = %w[ja tcn].map do |locale|
  Dir.glob(File.join(server, 'data/csv', locale, '*.csv')).to_h do |path|
    [File.basename(path, '.csv'), path]
  end
end
sources = sources_by_locale.reduce(&:merge).sort
now = Time.now.utc

def convert(type, cell)
  return cell.to_s unless %i[integer float decimal boolean date datetime].include?(type)

  value = cell.to_s.strip
  case type
  when :integer then value.empty? ? 0 : Integer(value, 10)
  when :float then value.empty? ? 0.0 : Float(value)
  when :decimal then value.empty? ? 0 : BigDecimal(value)
  when :boolean
    case value.downcase
    when '', '0', 'false', 'f' then false
    when '1', 'true', 't' then true
    else raise ArgumentError, "Invalid boolean: #{value.inspect}"
    end
  when :date, :datetime
    return nil if value.empty? || value.start_with?('0000-00-00')

    type == :date ? Date.parse(value) : Time.parse(value).utc
  end
end

db.transaction do
  sources.each do |name, path|
    klass = Unlight.const_get(name.singularize)
    table = klass.table_name
    abort "Refusing to replace a populated table: #{table}" unless db[table].empty?

    schema = db.schema(table).to_h
    rows = CSV.read(path, headers: true, encoding: 'bom|utf-8')
    headers = rows.headers.reject { |header| header.match? language_suffix }
    unknown = headers.map(&:to_sym) - schema.keys
    abort "Unknown columns in #{name}: #{unknown.join(', ')}" unless unknown.empty?

    columns = headers.reject { |header| %w[created_at updated_at].include?(header) }.to_h do |name|
      tcn = "#{name}_tcn"
      [name.to_sym, rows.headers.include?(tcn) ? tcn : name]
    end
    imported = rows.map.with_index(2) do |row, row_number|
      data = columns.to_h do |column, source|
        [column, convert(schema.fetch(column).fetch(:type), row[source])]
      rescue ArgumentError => error
        raise ArgumentError, "#{name}.csv:#{row_number} #{source}: #{error.message}"
      end
      data[:created_at] = now if schema.key?(:created_at)
      data[:updated_at] = now if schema.key?(:updated_at)
      data
    end
    db[table].multi_insert(imported, slice: 100)
    loaded = db[table].count
    abort "Expected #{imported.size} #{table} rows, got #{loaded}" unless loaded == imported.size

    puts "#{File.basename(File.dirname(path))}/#{name}.csv -> #{table}: #{loaded}"
  end
end
