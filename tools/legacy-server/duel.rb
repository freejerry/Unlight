require 'csv'
require 'json'

$SERVER_NAME = 'legacy-characterization'
require_relative 'isolated_server'
include Unlight

csv_root, seed_argument = ARGV
seed = Integer(seed_argument)
stage = 0

csv_rows = ->(file) { CSV.read(File.join(csv_root, file), headers: true, encoding: 'bom|utf-8') }
event_rows = csv_rows.call('EventCards.csv').select do |row|
  row['filler'] == '1' || row['id'].to_i == JOKER_EVENT_CARD
end
action_ids = STAGE_DECK.fetch(stage).dup
event_rows.each do |row|
  copies = row['id'].to_i == JOKER_EVENT_CARD ? row['max_in_deck'].to_i : SLOT_MAX_EVENT * 2
  first = row['event_no'].to_i
  action_ids.concat((first...(first + copies)).to_a)
end
action_ids.uniq!
action_fields = %i[id u_type u_value b_type b_value event_no]
rows = csv_rows.call('ActionCards.csv').filter_map do |row|
  next unless action_ids.include?(row['id'].to_i)

  action_fields.to_h { |key| [key, Integer(row[key.to_s])] }
end
missing = action_ids - rows.map { |row| row.fetch(:id) }
abort "Missing fixture action IDs: #{missing.join(', ')}" unless missing.empty?

DB.transaction do
  DB[:action_cards].multi_insert(rows)
  event_rows.each do |row|
    DB[:event_cards].insert(id: row['id'].to_i, event_no: row['event_no'].to_i,
                            max_in_deck: row['max_in_deck'].to_i, filler: row['filler'] == '1')
  end
  DB[:chara_cards].insert(id: 1, name: 'Fixture A', level: 1, hp: 12, ap: 5, dp: 3)
  DB[:chara_cards].insert(id: 2, name: 'Fixture B', level: 1, hp: 10, ap: 4, dp: 3)
end
EventCard.initialize_event_card

# Advance legacy wall-clock timers manually during this single isolated process.
module ReplayClock
  class << self
    attr_accessor :tick

    def now
      Time.at(1_700_000_000 + Rational(tick, 10)).utc
    end
  end
end
module FixedTime
  def now
    ReplayClock.now
  end
end
ReplayClock.tick = 0
Time.singleton_class.prepend(FixedTime)
srand(seed)

FixtureDeck = Struct.new(:cards, :event_cards, :weapon_cards, :equip_cards)
FixtureAvatar = Struct.new(:name)
players = [1, 2].map do |id|
  FixtureDeck.new([CharaCard[id]], [[]], [[]], [[]])
end
duel = MultiDuel.new(FixtureAvatar.new('Fixture A'), AI, *players,
                     RULE_3VS3, false, :quest_ai, stage)

trace = []
record = lambda do |phase, payload = {}|
  trace << { tick: ReplayClock.tick, turn: duel.turn, phase: phase,
             hp: duel.entrants.map(&:total_hit_point) }.merge(payload)
end
duel.add_finish_listener_start_turn_phase(->(_duel, _) { record.call('start_turn') })
duel.add_finish_listener_refill_card_phase(lambda do |_duel, hands|
  record.call('draw', cards: hands.map { |hand| hand.map(&:id) })
end)
duel.add_finish_listener_refill_event_card_phase(lambda do |_duel, hands|
  record.call('draw_event', cards: hands.map { |hand| hand.map(&:id) })
end)
duel.add_start_listener_move_card_drop_phase(lambda do |_duel|
  record.call('move_input')
  duel.alpha.init_done_action
end)
duel.add_finish_listener_determine_move_phase(lambda do |_duel, _|
  record.call('movement_resolved', initiative: duel.initi, distance: duel.alpha.distance)
end)

submit_hand = lambda do |role, type|
  player = duel.alpha
  submitted = []
  player.cards.dup.each do |card|
    direction = if card.u_type == type
                  true
                elsif card.b_type == type
                  false
                end
    next if direction.nil? || card.event_no != 0

    player.public_send("#{role}_card_add_action", [card.id], [direction])
    submitted << [card.id, direction] if player.battle_table.include?(card)
  end
  player.public_send("#{role}_done_action")
  submitted
end
duel.add_start_listener_attack_card_drop_phase(lambda do |_duel|
  if duel.first_entrant == duel.alpha
    type = duel.alpha.distance <= 1 ? ActionCard::SWD : ActionCard::ARW
    record.call('player_attack_input', submitted: submit_hand.call('attack', type))
  else
    record.call('cpu_attack_input')
  end
end)
duel.add_start_listener_deffence_card_drop_phase(lambda do |_duel|
  if duel.second_entrant == duel.alpha
    record.call('player_defence_input', submitted: submit_hand.call('deffence', ActionCard::DEF))
  else
    record.call('cpu_defence_input')
  end
end)
duel.add_finish_listener_determine_battle_point_phase(lambda do |_duel, tables|
  record.call('battle_points', points: duel.bp.dup,
              tables: tables.map { |table| table.map(&:id) })
end)
duel.add_finish_listener_battle_result_phase(lambda do |_duel, dice|
  record.call('dice', dice: dice, damage: duel.tmp_damage)
end)
duel.add_finish_listener_damage_phase(->(_duel, _) { record.call('damage_resolved') })
duel.add_finish_listener_change_initiative_phase(->(_duel, _) { record.call('initiative_changed', initiative: duel.initi) })
duel.add_finish_listener_finish_turn_phase(->(_duel, _) { record.call('finish_turn') })

duel.alpha.start_ok
duel.three_to_three_duel
(1..3_000).each do |tick|
  ReplayClock.tick = tick
  MultiDuel.update if (tick % 3).zero?
  AI.update if (tick % 10).zero?
  break unless duel.result.empty?
end
abort "No legacy result after #{ReplayClock.tick} ticks at turn #{duel.turn}; last events #{trace.last(5).inspect}" if duel.result.empty?
result_codes = { RESULT_WIN => 'won', RESULT_LOSE => 'lost', RESULT_DRAW => 'draw' }
outcome = duel.result.map { |entrant| result_codes.fetch(entrant.fetch(:result)) }
record.call('finished', outcome: outcome, remaining_hp: duel.result.map { |entry| entry.fetch(:remain_hp) })
abort 'No attack or damage observed' unless trace.any? { |entry| entry[:phase] == 'dice' && entry[:damage].positive? }
puts "CHARACTERIZATION #{JSON.generate(seed: seed, outcome: outcome, trace: trace)}"
