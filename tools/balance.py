"""MVP balance check: expected-value numbers for the Umbra mansion floor.
Run: python3 balance.py  (fails loudly if a target is missed)"""
avg = lambda n, d, b=0: n * (d + 1) / 2 + b          # average of NdD+b
reduce = lambda ac: 1 - (ac - 10) * 0.03              # AC -> damage multiplier
AI = 0.8                                               # AI partner deals 80%

# hero DPS (attack damage / cooldown)
york = avg(1, 8, 3) / 0.6                              # Morningstar, Extra Attack = fast swing
atez = 2 * avg(1, 10, 7) / 1.4                         # Eldritch Blast x2 beams + Agonizing
smite = avg(3, 8)                                      # 2d8 +1d8 vs undead, 3 slots
enemies = {"footman": 24, "maid": 14, "kinsman": 36, "kinswoman": 28,
           "brother": 140, "mother": 120, "maggot": 8}

def ttk(hp, dps): return hp / dps

print(f"York {york:.1f} dps | Atez {atez:.1f} dps | Smite +{smite:.1f}")
for name, hp in enemies.items():
    print(f"  {name:10s} HP {hp:3d}  York {ttk(hp, york):4.1f}s  Atez {ttk(hp, atez):4.1f}s")
    if name in ("footman", "maid", "kinsman", "kinswoman"):
        assert 0.9 <= ttk(hp, york) <= 3.5, name           # fodder dies in 1-3.5 s

# boss: P1 + P2 HP 800 each; body x0.5, pustules x1 (they also hit boss HP); uptime 55%
def boss_time(player_dps, partner_dps, hp=800, uptime=0.55, weak_share=0.35):
    mult = weak_share * 1.0 + (1 - weak_share) * 0.5 + 0.06  # +exposed windows
    return hp / ((player_dps + partner_dps * AI) * uptime * mult)
for who, p, q in (("play York", york, atez), ("play Atez", atez, york)):
    t = 2 * boss_time(p, q)
    print(f"Boss ({who}): {t:.0f}s total")
    assert 120 <= t <= 240, who                              # target 2-4 minutes

# York survivability in a wave room: 2 footmen + 2 maids + 1 kinswoman attacking
incoming = (avg(1, 8, 2) / 2.5 * 2 + avg(1, 6, 1) / 2.0 * 2 + avg(1, 4) / 0.5 * 4 / 5 / 2) * reduce(19)
hit_rate = 0.30                                              # share of telegraphs a new player fails to dodge
room, alive = 30, 0.35                                       # 30 s room, each enemy alive ~35% of it
taken = incoming * hit_rate * room * alive
print(f"York takes ~{taken:.0f} of 59 HP per wave room (+25 Lay on Hands per floor)")
assert 15 <= taken <= 30

# skill checks: success chance per hero (bonuses from the real sheets)
chance = lambda bonus, dc: max(0.05, min(0.95, (21 - (dc - bonus)) / 20))
checks = {"Medicine DC13 (cabinet)": (13, 4, -1), "Investigation DC13 (ledger)": (13, 0, 6),
          "Athletics DC14 (cellar door)": (14, 6, -3), "Deception DC12 (servant ghost)": (12, None, 10)}
for name, (dc, y, a) in checks.items():
    ys = "-" if y is None else f"{chance(y, dc):.0%}"
    print(f"{name:32s} York {ys:>4s}  Atez {chance(a, dc):.0%}")

# lie contest: Deception d20+10 vs Insight d20+4 (+5 if Trust < 40); tie = lie fails
def lie_wins(insight):
    return sum(a + 10 > b + insight for a in range(1, 21) for b in range(1, 21)) / 400
print(f"Lie succeeds: {lie_wins(4):.0%} (Trust >= 40), {lie_wins(9):.0%} (Trust < 40)")

# XP: normal 1, kin 2, elite 8, maggot 1; brother summons 2 footmen at 75/50/25%; ~10 maggots in boss P1
xp = {"R0": 2, "R1": 4 + 2 * 2 + 8 + 6, "R2a": 2 + 2 + 1, "R2b": 3 + 2, "R4": 2 + 2 + 8, "boss": 10}
thresholds = [3, 7, 12, 18, 25, 32, 40, 50]
cards = lambda x: sum(x >= t for t in thresholds)
one = xp["R0"] + xp["R1"] + xp["R2a"] + xp["R4"]
both = one + xp["R2b"]
print(f"XP one route {one}+{xp['boss']} -> {cards(one)} cards before boss, {cards(one + xp['boss'])} total | "
      f"both routes {both}+{xp['boss']} -> {cards(both + xp['boss'])} total")
assert cards(one) >= 7          # R3 chest pair Lv2->5 (3+3) + evolution card, before the boss
assert cards(both + xp["boss"]) <= 8

# Trust: Monte Carlo of three player styles, final value must mostly land 40-70 for the median style
import random
def run(careful):
    t = 50
    t += 10 if random.random() < careful * 0.6 else 0                 # prayed all 7 corpses
    t += 5 * sum(random.random() < careful for _ in range(2))         # Atez finishes mother / brother
    t += min(5, sum(random.random() < careful * 0.5 for _ in range(8)))   # body-blocks
    t += min(6, 2 * sum(random.random() < careful for _ in range(4)))     # York breaks embraces
    t += min(9, 3 * sum(random.random() < careful for _ in range(4)))     # anchors in boss P2
    t += 5 * sum(random.random() < careful * 0.8 for _ in range(2))   # timely revives
    t -= 5 * sum(random.random() < (1 - careful) * 0.6 for _ in range(3))  # partner down > 10 s
    t -= 5 * sum(random.random() < (1 - careful) * 0.5 for _ in range(2))  # left family on York
    t -= 10 if random.random() < (1 - careful) * 0.7 else 0          # lied / silent in act 2
    return max(0, min(100, t))
random.seed(1)
for label, c in (("careless", 0.25), ("average", 0.5), ("devoted", 0.85)):
    xs = sorted(run(c) for _ in range(4000))
    print(f"Trust {label:8s} median {xs[2000]:3d}  10-90% {xs[400]}-{xs[3600]}")
    if label == "average": assert 40 <= xs[2000] <= 70
