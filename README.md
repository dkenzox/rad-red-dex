# Pokemon Battle Stat Investigation

This README explains how stats affect damage, defenses, HP, and Speed in a modern Pokemon battle system. For the worked examples, I assume modern main-series style mechanics, which is the right baseline for a modern Radical Red discussion.

## Scope and assumptions

- I interpret `0 SpA`, `100 SpA`, `0 SpD`, and `100 SpD` as base stats, not in-battle stat stages.
- Actual battle damage uses the attacker's real stat and the defender's real stat after level, IVs, EVs, nature, stat stages, items, abilities, and field effects.
- For the concrete BP 60 examples below, I use:
  - Level 100 and Level 50 examples
  - 31 IVs
  - 0 EVs
  - neutral nature
  - no STAB
  - neutral typing
  - no crit
  - no item, ability, weather, screens, or terrain modifier
  - the normal 0.85 to 1.00 damage roll

## 1. Base stats are not the final battle stats

For non-HP stats:

```text
Stat = floor((floor(((2 * Base + IV + floor(EV / 4)) * Level) / 100) + 5) * Nature)
```

For HP:

```text
HP = floor(((2 * Base + IV + floor(EV / 4)) * Level) / 100) + Level + 10
```

That means a Pokemon does not use `100 SpA` directly in battle. It uses its real Special Attack stat after this conversion.

### Example conversion

At Level 100, with 31 IVs, 0 EVs, neutral nature:

| Base stat | Real non-HP stat | Real HP |
| --- | ---: | ---: |
| 0 | 36 | 141 |
| 100 | 236 | 341 |

At Level 50, with the same assumptions:

| Base stat | Real non-HP stat | Real HP |
| --- | ---: | ---: |
| 0 | 20 | 75 |
| 100 | 120 | 175 |

Important consequence: the battle engine cares about the real stat, not the base stat shown in the Pokedex.

## 2. The standard damage formula

For a normal damaging move, the core damage formula is:

```text
Damage = floor(floor(floor((2 * Level / 5 + 2) * Power * A / D) / 50) + 2) * modifiers
```

Where:

- `Power` is the move's base power, such as 60.
- `A` is the relevant attacking stat:
  - `Attack` for physical moves
  - `Special Attack` for special moves
- `D` is the relevant defending stat:
  - `Defense` for physical moves
  - `Special Defense` for special moves
- `modifiers` include things like STAB, type effectiveness, weather, crits, burn, abilities, items, screens, and the random roll.

## 3. What BP, SpA, and SpD really do

There are three key ideas:

1. Base Power scales damage linearly.
2. Offense and defense mainly matter as a ratio: `A / D`.
3. HP is not part of the normal damage formula. HP only decides how much damage you can survive.

So a `BP 60` move does not have one fixed damage number. Its damage depends heavily on the ratio between the attacker's offensive stat and the target's defensive stat.

## 4. Worked example: BP 60 special move

Here I treat the move as a special move, so the relevant stats are `SpA` and `SpD`.

### Level 100 example

Assumptions:

- attacker and defender are both Level 100
- 31 IVs, 0 EVs, neutral nature
- no STAB, no weakness/resistance, no other modifiers

Real stats from the base stats:

- base `0 SpA` becomes `36 SpA`
- base `100 SpA` becomes `236 SpA`
- base `0 SpD` becomes `36 SpD`
- base `100 SpD` becomes `236 SpD`

Damage for a BP 60 special move:

| Attacker base SpA | Defender base SpD | Real A | Real D | Damage range |
| --- | --- | ---: | ---: | ---: |
| 0 | 0 | 36 | 36 | 44-52 |
| 0 | 100 | 36 | 236 | 7-9 |
| 100 | 0 | 236 | 36 | 282-332 |
| 100 | 100 | 236 | 236 | 44-52 |

### Direct answer to your question

- If the attacker goes from base `0 SpA` to base `100 SpA`, while the target stays at base `0 SpD`, the same BP 60 move jumps from `44-52` damage to `282-332` damage at Level 100 under these assumptions. That is about `6.4x` more damage.
- If the defender goes from base `0 SpD` to base `100 SpD`, while the attacker stays at base `0 SpA`, the same move falls from `44-52` damage to `7-9` damage. That is about an `83%` reduction.
- If both attacker and defender go from base `0` to base `100` together, damage ends up nearly the same, because the ratio `A / D` stayed almost the same.

That last point is the important one: offense and defense cancel each other out through the ratio.

### Level 50 example

At Level 50 with the same assumptions:

- base `0` becomes `20`
- base `100` becomes `120`

Damage for the same BP 60 special move:

| Attacker base SpA | Defender base SpD | Real A | Real D | Damage range |
| --- | --- | ---: | ---: | ---: |
| 0 | 0 | 20 | 20 | 23-28 |
| 0 | 100 | 20 | 120 | 5-6 |
| 100 | 0 | 120 | 20 | 136-160 |
| 100 | 100 | 120 | 120 | 23-28 |

## 5. If you meant stat stages instead of base stats

Sometimes people say `+1 SpA`, `-1 SpD`, or `0 SpA` when they mean in-battle stat stages, not base stats.

For normal stat stages in battle:

| Stage | Attacking stat multiplier | Defending stat multiplier |
| --- | ---: | ---: |
| -2 | 0.50x | 0.50x |
| -1 | 0.67x | 0.67x |
| 0 | 1.00x | 1.00x |
| +1 | 1.50x | 1.50x |
| +2 | 2.00x | 2.00x |
| +3 | 2.50x | 2.50x |
| +4 | 3.00x | 3.00x |
| +5 | 3.50x | 3.50x |
| +6 | 4.00x | 4.00x |

Practical result:

- `+1 SpA` is roughly `1.5x` damage before other modifiers.
- `+2 SpA` is roughly `2x`.
- `+1 SpD` makes special damage roughly `2/3` as large.
- `-1 SpD` makes special damage roughly `1.5x` larger.

## 6. What HP changes

HP does not normally change the raw damage number of a move. Instead, it changes how much punishment a Pokemon can absorb.

### HP is your total health pool

If two Pokemon take the same 100 damage:

- the one with `200 HP` loses `50%`
- the one with `400 HP` loses `25%`

### HP improves both physical and special bulk

Defense only helps against physical hits. Special Defense only helps against special hits. HP helps against both.

That is why players often think in terms of:

- physical bulk = `HP x Defense`
- special bulk = `HP x Special Defense`

### HP example

At Level 100, with 31 IVs, 0 EVs, neutral nature:

- base `0 HP` becomes `141 HP`
- base `100 HP` becomes `341 HP`

If Special Defense is fixed at `236`, then:

- special bulk with base `0 HP` is `141 x 236 = 33,276`
- special bulk with base `100 HP` is `341 x 236 = 80,476`

So going from base `0 HP` to base `100 HP` gives about `2.42x` as much special bulk, and the same idea applies on the physical side if Defense is held constant.

### HP also affects many side mechanics

HP matters for more than just surviving hits:

- percentage-based recovery such as Leftovers, Recover, Roost, Wish, Leech Seed, and similar effects
- entry hazards such as Stealth Rock and Spikes
- recoil and chip damage
- Substitute, which costs 25% of max HP
- HP-based moves such as Eruption, Water Spout, Reversal, Flail, Endeavor, and Final Gambit

## 7. What Speed changes

Speed usually does not raise the damage of a normal move. Instead, Speed decides who acts first inside the same priority bracket.

### The normal order rule

Battle order generally works like this:

1. Priority comes first.
2. Inside the same priority bracket, the faster Pokemon moves first.
3. Under Trick Room, the slower Pokemon moves first inside that bracket.

So Speed often changes the entire result of a turn even when damage numbers stay identical.

### Why Speed is so important

A faster Pokemon can:

- KO the opponent before taking a hit
- use setup first
- use status first
- get recovery first
- U-turn or Volt Switch before or after the opponent, depending on what you want
- revenge kill weakened targets

That means Speed has huge battle impact even though it is usually not written directly into the damage formula.

### Speed modifiers

A Pokemon's effective Speed can be changed by:

- Speed stat stages
- paralysis
- Choice Scarf
- Tailwind
- abilities such as Swift Swim, Chlorophyll, Sand Rush, Slush Rush, Unburden, and Surge Surfer
- move priority effects such as Prankster, Gale Wings, and Triage

### Special cases

Some moves do care directly about Speed:

- `Electro Ball` gets stronger when the user is much faster than the target.
- `Gyro Ball` gets stronger when the user is much slower than the target.

Also, in Generation I only, base Speed affected critical hit rate. That is not how modern battles work.

## 8. Big conclusions

- Move damage is mostly about `Level`, `Base Power`, the attacking stat, the defending stat, and then the usual modifiers.
- `SpA` and `SpD` mostly fight each other through a ratio. Raising one side and raising the other side by the same proportion tends to keep damage similar.
- `HP` does not usually make your move stronger or weaker. It changes how many hits you can live through.
- `Defense` and `Special Defense` protect only one side of the attacking spectrum. `HP` supports both.
- `Speed` usually does not change the raw damage number, but it often decides who gets to act at all, which is often more important than a small damage increase.

## 9. Short answer in one paragraph

For a BP 60 special move, the difference between `0 SpA` and `100 SpA` is massive, but only relative to the target's `SpD`. Under neutral Level 100 assumptions, going from base `0 SpA` to base `100 SpA` changes the move from `44-52` damage to `282-332` damage against a base `0 SpD` target. If the target instead has base `100 SpD`, that same low-SpA attack drops to `7-9` damage. HP does not directly enter the normal damage formula, but it multiplies survivability by making every hit a smaller fraction of your health. Speed usually does not change damage, but it decides move order inside a priority bracket, which is often battle-defining.

## Sources

These formulas and turn-order rules were verified against:

- [Bulbapedia: Stat](https://m.bulbapedia.bulbagarden.net/wiki/Stat)
- [Bulbapedia: Damage](https://bulbapedia.bulbagarden.net/wiki/Damage)
- [The Cave of Dragonflies: Battle Mechanics](https://www.dragonflycave.com/mechanics/battle/)

The concrete damage tables in this README were then calculated from those formulas under the assumptions listed at the top.

## Repository note

This repository is still `rad-red-dex`, a browser-based Radical Red Pokedex fork. This README was replaced with a mechanics report because the requested task for this pass was to write the investigation into `README.md`.
