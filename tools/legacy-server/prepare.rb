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
  abort 'A player with that name already exists in this copy.' if Player[name: name]

  srp = SRP.new
  salt = SecureRandom.hex(20)
  verifier = srp.get_verifier(srp.get_private_key(name, password, salt))
  result = Player.regist(name, 'playtest@example.invalid', salt, verifier, SERVER_SB)
  abort 'Playtest registration failed.' unless result == RG_NG[:none]
end
