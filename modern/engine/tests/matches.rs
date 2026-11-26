use naval_engine::{replay, Action, CardKind, Game, Status};

const DEMO_SEED: u32 = 3407;

#[test]
fn attack_strategy_wins_and_replays_the_same_events() {
    let mut game = Game::new(DEMO_SEED);
    let mut actions = Vec::new();

    while game.view().status == Status::Playing {
        let view = game.view();
        let action = view
            .hand
            .iter()
            .filter(|card| card.kind == CardKind::Strike && card.cost <= view.energy)
            .max_by_key(|card| card.power)
            .map(|card| Action::Play {
                card_id: card.id.clone(),
            })
            .unwrap_or(Action::EndTurn);
        game.apply(action.clone())
            .expect("strategy plays a valid move");
        actions.push(action);
    }

    let final_view = game.view();
    assert_eq!(final_view.status, Status::Won);
    assert_eq!(final_view.opponent.hp, 0);
    assert!(final_view.events.iter().any(|event| event.kind == "dice"));
    assert_eq!(final_view.revision as usize, actions.len());
    for (index, event) in final_view.events.iter().enumerate() {
        assert_eq!(event.seq as usize, index + 1);
    }
    assert_eq!(replay(DEMO_SEED, actions).unwrap(), final_view);
}

#[test]
fn idle_player_loses_and_match_refuses_additional_actions() {
    let mut game = Game::new(DEMO_SEED);

    while game.view().status == Status::Playing {
        game.apply(Action::EndTurn).unwrap();
    }

    let final_view = game.view();
    assert_eq!(final_view.status, Status::Lost);
    assert_eq!(final_view.player.hp, 0);
    assert!(game.apply(Action::EndTurn).is_err());
    assert_eq!(game.view(), final_view);
}

#[test]
fn invalid_actions_leave_the_match_unchanged() {
    let mut game = Game::new(DEMO_SEED);
    let initial = game.view();
    let missing = game.apply(Action::Play {
        card_id: "missing-card".into(),
    });
    assert!(missing.is_err());
    assert_eq!(game.view(), initial);

    for index in [0, 3] {
        game.apply(Action::Play {
            card_id: initial.hand[index].id.clone(),
        })
        .unwrap();
    }
    let before_rejection = game.view();
    let torpedo = game.apply(Action::Play {
        card_id: initial.hand[1].id.clone(),
    });
    assert!(torpedo.is_err());
    assert_eq!(game.view(), before_rejection);
}

#[test]
fn shield_absorbs_damage_and_then_expires() {
    let mut game = Game::new(DEMO_SEED);
    let card_id = game
        .view()
        .hand
        .iter()
        .find(|card| card.kind == CardKind::Guard)
        .unwrap()
        .id
        .clone();
    game.apply(Action::Play { card_id }).unwrap();
    let guarded = game.view();
    assert_eq!(guarded.player.shield, 5);
    game.apply(Action::EndTurn).unwrap();
    let next = game.view();
    assert_eq!(next.player.shield, 0);
    assert!(next.player.hp >= guarded.player.hp - 1);
    assert_eq!(next.hand.len(), 4);
    assert_eq!(next.energy, next.max_energy);
}
