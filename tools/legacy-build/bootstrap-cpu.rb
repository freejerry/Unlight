require 'securerandom'

probe = File.realpath(File.join(__dir__, 'runtime-probe'))
abort "Run the CPU bootstrap in #{probe}" unless Dir.pwd == probe
$LOAD_PATH.unshift(File.join(probe, 'src'))
$SERVER_NAME = 'legacy-build-cpu'
require 'unlight'

include Unlight
DB.transaction do
  cpu = Player.first(role: ROLE_CPU)
  cpu ||= Player.create(
    name: 'CPU',
    role: ROLE_CPU,
    email: 'cpu@example.invalid',
    salt: SecureRandom.hex(16)
  )
  if cpu.avatars.empty?
    starter = REGIST_CARDS.first
    abort "Missing registered starter card #{starter}" unless CharaCard[starter]
    avatar = Avatar.regist('CPU', cpu.id, [], [starter], cpu.server_type)
    abort "CPU avatar registration failed" unless avatar
  end
end

CharaCardDeck.initialize_CPU_deck
expected_decks = CpuCardData.count
actual_decks = CharaCardDeck.where(Sequel.like(:name, 'Monster: %')).count
abort "Expected #{expected_decks} CPU decks, found #{actual_decks}" unless actual_decks == expected_decks

puts "Initialized #{actual_decks} CPU decks"
