require 'securerandom'

$SERVER_NAME = 'legacy-prepare'
require_relative 'isolated_server'
include Unlight

abort 'Missing players schema.' unless DB.table_exists?(:players)

if !CpuCardData.dataset.empty?
  # A populated master DB needs a CPU avatar before the legacy deck initializer runs.
  # On a fresh DB its automatic registration otherwise passes an empty card list.
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
      abort 'Could not provision the CPU avatar.' unless Avatar.regist('CPU', cpu.id, [], [starter], cpu.server_type)
    end
  end
end

if (name = ARGV.first)
  require 'net/srp'
  password = STDIN.read
  abort 'Playtest credentials must be nonempty.' if name.empty? || password.empty?
  first_quest = ARGV[1] == 'first-quest'
  if first_quest && ![name, password].all? { |field| /\A[A-Za-z0-9_.-]{1,16}\z/.match?(field) }
    abort 'This fixture uses the original client’s 1–16 character login fields.'
  end
  abort 'A player with that name already exists in this copy.' if Player[name: name]

  srp = SRP.new
  salt = SecureRandom.hex(20)
  verifier = srp.get_verifier(srp.get_private_key(name, password, salt))
  result = Player.regist(name, 'playtest@example.invalid', salt, verifier, SERVER_SB)
  abort 'Playtest registration failed.' unless result == RG_NG[:none]

  if first_quest
    DB.transaction do
      player = Player.first(name: name)
      starters = REGIST_CARDS.first(3)
      abort 'The initial quest fixture needs the original starter cards.' unless starters.length == 3 && starters.all? { |id| CharaCard[id] }

      avatar = Avatar.regist(name, player.id, [1, 5, 10, 15], [starters.first], player.server_type)
      abort 'Could not initialize the playtest avatar.' unless avatar && avatar.id
      player.update_played_tutorial(14)
      player.update_login_at
      deck = avatar.duel_deck
      starters.drop(1).each_with_index do |id, index|
        CardInventory.create(chara_card_deck_id: deck.id, chara_card_id: id, position: index + 1)
      end

      srand(2026)
      acquired = avatar.get_quest(1, 0)
      inventory = AvatarQuestInventory.first(avatar_id: avatar.id)
      abort 'Could not prepare the original first quest.' unless acquired == 0 && inventory && inventory.quest_id == 1
    end
  end
end
