use serde::{Deserialize, Serialize};

const MAX_HULL: u8 = 24;
const MAX_ENERGY: u8 = 3;
const HAND_SIZE: usize = 4;
const TURN_LIMIT: u8 = 16;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    Play { card_id: String },
    EndTurn,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Playing,
    Won,
    Lost,
    Draw,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CardKind {
    Strike,
    Guard,
    Repair,
    Surge,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GameView {
    pub turn: u8,
    pub revision: u32,
    pub status: Status,
    pub player: Ship,
    pub opponent: Ship,
    pub energy: u8,
    pub max_energy: u8,
    pub hand: Vec<HandCard>,
    pub events: Vec<BattleEvent>,
    pub deck_count: usize,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Ship {
    pub hp: u8,
    pub max_hp: u8,
    pub shield: u8,
}

impl Ship {
    fn damage(&mut self, amount: u8) -> (u8, u8) {
        let blocked = self.shield.min(amount);
        self.shield -= blocked;
        let lost = self.hp.min(amount - blocked);
        self.hp -= lost;
        (blocked, lost)
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct HandCard {
    pub id: String,
    pub name: String,
    pub kind: CardKind,
    pub cost: u8,
    pub description: String,
    pub power: u8,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct BattleEvent {
    pub seq: u32,
    pub text: String,
    pub kind: String,
}

#[derive(Clone, Copy)]
struct CardSpec {
    name: &'static str,
    kind: CardKind,
    cost: u8,
    description: &'static str,
    power: u8,
}

const ARC_CANNON: CardSpec = CardSpec {
    name: "弧光艦砲",
    kind: CardKind::Strike,
    cost: 1,
    description: "造成 4 點傷害。若擲出 5 或 6，追加 2 點。",
    power: 4,
};

const TORPEDO: CardSpec = CardSpec {
    name: "破霧魚雷",
    kind: CardKind::Strike,
    cost: 2,
    description: "造成 7 點傷害。若擲出 5 或 6，追加 2 點。",
    power: 7,
};

const TIDE_SCREEN: CardSpec = CardSpec {
    name: "潮汐護幕",
    kind: CardKind::Guard,
    cost: 1,
    description: "獲得 5 點護盾，下一回合開始時消失。",
    power: 5,
};

const HULL_PATCH: CardSpec = CardSpec {
    name: "艙體縫合",
    kind: CardKind::Repair,
    cost: 1,
    description: "修復最多 4 點船體。",
    power: 4,
};

const FLUX_COIL: CardSpec = CardSpec {
    name: "聚流線圈",
    kind: CardKind::Surge,
    cost: 1,
    description: "本回合下一次攻擊增加 3 點傷害。",
    power: 3,
};

#[derive(Clone, Copy)]
struct Random(u32);

impl Random {
    fn next(&mut self) -> u32 {
        let mut value = self.0;
        value ^= value << 13;
        value ^= value >> 17;
        value ^= value << 5;
        self.0 = value;
        value
    }

    fn die(&mut self) -> u8 {
        ((self.next() % 6) + 1) as u8
    }

    fn shuffle<T>(&mut self, cards: &mut [T]) {
        for index in (1..cards.len()).rev() {
            let swap_index = self.next() as usize % (index + 1);
            cards.swap(index, swap_index);
        }
    }
}

pub struct Game {
    turn: u8,
    revision: u32,
    status: Status,
    player: Ship,
    opponent: Ship,
    energy: u8,
    boost: u8,
    hand: Vec<HandCard>,
    deck: Vec<HandCard>,
    discard: Vec<HandCard>,
    events: Vec<BattleEvent>,
    random: Random,
}

impl Game {
    pub fn new(seed: u32) -> Self {
        let ship = Ship {
            hp: MAX_HULL,
            max_hp: MAX_HULL,
            shield: 0,
        };
        let specs = [
            ARC_CANNON,
            TORPEDO,
            TIDE_SCREEN,
            FLUX_COIL,
            ARC_CANNON,
            ARC_CANNON,
            ARC_CANNON,
            ARC_CANNON,
            TORPEDO,
            TORPEDO,
            TIDE_SCREEN,
            TIDE_SCREEN,
            HULL_PATCH,
            HULL_PATCH,
            FLUX_COIL,
            FLUX_COIL,
        ];
        let mut hand: Vec<_> = specs
            .into_iter()
            .enumerate()
            .map(|(index, spec)| HandCard {
                id: format!("card-{}", index + 1),
                name: spec.name.to_owned(),
                kind: spec.kind,
                cost: spec.cost,
                description: spec.description.to_owned(),
                power: spec.power,
            })
            .collect();
        let mut deck = hand.split_off(HAND_SIZE);
        let mut random = Random(seed.max(1));
        random.shuffle(&mut deck);
        let mut game = Self {
            turn: 1,
            revision: 0,
            status: Status::Playing,
            player: ship,
            opponent: ship,
            energy: MAX_ENERGY,
            boost: 0,
            hand,
            deck,
            discard: Vec::new(),
            events: Vec::new(),
            random,
        };
        game.event("system", "霧中發現巡弋艇。你的回合開始。");
        game
    }

    pub fn view(&self) -> GameView {
        GameView {
            turn: self.turn,
            revision: self.revision,
            status: self.status,
            player: self.player,
            opponent: self.opponent,
            energy: self.energy,
            max_energy: MAX_ENERGY,
            hand: self.hand.clone(),
            events: self.events.clone(),
            deck_count: self.deck.len(),
        }
    }

    pub fn apply(&mut self, action: Action) -> Result<(), String> {
        if self.status != Status::Playing {
            return Err("這場對局已經結束。".to_owned());
        }
        match action {
            Action::Play { card_id } => self.play(&card_id)?,
            Action::EndTurn => self.end_turn(),
        }
        self.revision += 1;
        Ok(())
    }

    fn play(&mut self, card_id: &str) -> Result<(), String> {
        let index = self
            .hand
            .iter()
            .position(|card| card.id == card_id)
            .ok_or_else(|| "這張牌已經不在手上。".to_owned())?;
        let card = &self.hand[index];
        if card.cost > self.energy {
            return Err("能量不足。".to_owned());
        }
        let card = self.hand.remove(index);
        self.energy -= card.cost;
        self.event("action", format!("你打出了「{}」。", card.name));
        match card.kind {
            CardKind::Strike => self.fire(card.power),
            CardKind::Guard => {
                self.player.shield += card.power;
                self.event("guard", format!("己方獲得 {} 點護盾。", card.power));
            }
            CardKind::Repair => {
                let restored = (self.player.max_hp - self.player.hp).min(card.power);
                self.player.hp += restored;
                self.event("repair", format!("己方修復 {restored} 點船體。"));
            }
            CardKind::Surge => {
                self.boost += card.power;
                self.event("surge", format!("下次攻擊提高 {} 點傷害。", self.boost));
            }
        }
        self.discard.push(card);
        Ok(())
    }

    fn fire(&mut self, power: u8) {
        let roll = self.random.die();
        let critical = if roll >= 5 { 2 } else { 0 };
        let boost = std::mem::take(&mut self.boost);
        let (blocked, lost) = self.opponent.damage(power + critical + boost);
        self.event("dice", roll_text("己方", roll, critical));
        self.event(
            "attack",
            format!("敵方船體損失 {lost} 點，護盾吸收 {blocked} 點。"),
        );
        if self.opponent.hp == 0 {
            self.finish(Status::Won);
        }
    }

    fn end_turn(&mut self) {
        self.event("system", "敵方開始行動。");
        let roll = self.random.die();
        let critical = if roll >= 5 { 2 } else { 0 };
        let power = 4 + (self.turn / 4).min(3);
        let (blocked, lost) = self.player.damage(power + critical);
        self.event("dice", roll_text("敵方", roll, critical));
        self.event(
            "attack",
            format!("己方船體損失 {lost} 點，護盾吸收 {blocked} 點。"),
        );
        if self.player.hp == 0 {
            self.finish(Status::Lost);
            return;
        }
        if self.turn == TURN_LIMIT {
            self.finish(match self.player.hp.cmp(&self.opponent.hp) {
                std::cmp::Ordering::Greater => Status::Won,
                std::cmp::Ordering::Less => Status::Lost,
                std::cmp::Ordering::Equal => Status::Draw,
            });
            return;
        }
        self.opponent.shield = 0;
        if self.turn % 3 == 0 {
            self.opponent.shield = 3;
            self.event("guard", "敵方獲得 3 點護盾。");
        }
        self.turn += 1;
        self.energy = MAX_ENERGY;
        self.player.shield = 0;
        self.boost = 0;
        self.discard.append(&mut self.hand);
        self.refill_hand();
        self.event(
            "system",
            format!("第 {} 回合，你已換牌並補滿能量。", self.turn),
        );
    }

    fn refill_hand(&mut self) {
        while self.hand.len() < HAND_SIZE {
            if self.deck.is_empty() {
                std::mem::swap(&mut self.deck, &mut self.discard);
                self.random.shuffle(&mut self.deck);
                self.event("system", "棄牌已洗回牌庫。");
            }
            if let Some(card) = self.deck.pop() {
                self.hand.push(card);
            } else {
                break;
            }
        }
    }

    fn finish(&mut self, status: Status) {
        self.status = status;
        let message = match status {
            Status::Won => "己方獲勝，航道已清空。",
            Status::Lost => "己方落敗，撤回霧港。",
            Status::Draw => "潮勢轉向，雙方撤離航道。",
            Status::Playing => unreachable!("battle result must be terminal"),
        };
        self.event("result", message);
    }

    fn event(&mut self, kind: &str, text: impl Into<String>) {
        self.events.push(BattleEvent {
            seq: self.events.len() as u32 + 1,
            text: text.into(),
            kind: kind.to_owned(),
        });
    }
}

fn roll_text(side: &str, roll: u8, critical: u8) -> String {
    if critical == 0 {
        format!("{side}擲出 {roll} 點。")
    } else {
        format!("{side}擲出 {roll} 點，強擊追加 {critical} 點傷害。")
    }
}

pub fn replay(seed: u32, actions: Vec<Action>) -> Result<GameView, String> {
    let mut game = Game::new(seed);
    for action in actions {
        game.apply(action)?;
    }
    Ok(game.view())
}

#[cfg(target_arch = "wasm32")]
mod wasm;
