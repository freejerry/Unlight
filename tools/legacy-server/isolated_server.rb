server = File.realpath(ENV.fetch('UNLIGHT_LEGACY_STAGE'))
marker = File.join(server, '.legacy-server-staging')
abort 'Use run.py to create an isolated server.' unless Dir.pwd == server && File.file?(marker)

$LOAD_PATH.unshift(File.join(server, 'src'))
require 'unlight'

expected_db = File.join(server, 'data/game_dev2.db')
abort 'Unexpected SQLite database.' unless Unlight::DB.opts[:database] == expected_db
