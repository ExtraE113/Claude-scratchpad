#!/usr/bin/env python3
"""
Planeswalker Ultimate Finder with Doubling Season

Finds all planeswalkers that can ultimate the turn they come into play
with Doubling Season in play, sorted by CubeCobra ELO rating.

With Doubling Season: Planeswalkers enter with DOUBLE their starting loyalty.
A planeswalker can ultimate if (starting_loyalty * 2) >= |ultimate_cost|
"""

import json
import re
import time
import sys
from dataclasses import dataclass
from typing import Optional
from urllib.parse import quote

try:
    import requests
except ImportError:
    print("Installing requests...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

# Constants
SCRYFALL_API = "https://api.scryfall.com"
CUBECOBRA_BASE = "https://cubecobra.com"
REQUEST_DELAY = 0.1  # Respect rate limits


@dataclass
class Planeswalker:
    """Represents a planeswalker card with ultimate analysis."""
    name: str
    mana_cost: str
    cmc: float
    colors: list
    starting_loyalty: int
    loyalty_with_doubling: int
    ultimate_cost: int
    ultimate_text: str
    can_ultimate_with_doubling: bool
    scryfall_uri: str
    image_uri: str
    elo: float = 1200.0  # Default ELO
    set_name: str = ""
    rarity: str = ""


def parse_loyalty_abilities(oracle_text: str) -> list[tuple[int, str]]:
    """
    Parse planeswalker abilities from oracle text.
    Returns list of (loyalty_cost, ability_text) tuples.
    Negative costs are for minus abilities, positive for plus.
    """
    abilities = []

    # Match patterns like "+1:", "−2:", "0:", "-3:" etc.
    # Note: Scryfall uses both − (U+2212) and - (U+002D) for minus
    pattern = r'([+−\-]?\d+):\s*([^+−\-]*?)(?=(?:[+−\-]\d+:|$))'

    # Also handle abilities that span multiple sentences
    lines = oracle_text.split('\n')

    for line in lines:
        line = line.strip()
        # Match the loyalty cost at the start of the line
        match = re.match(r'^([+−\-]?\d+):\s*(.+)$', line)
        if match:
            cost_str = match.group(1).replace('−', '-')  # Normalize minus sign
            cost = int(cost_str)
            text = match.group(2).strip()
            abilities.append((cost, text))

    return abilities


def find_ultimate_cost(abilities: list[tuple[int, str]]) -> tuple[int, str]:
    """
    Find the ultimate ability (most negative loyalty cost).
    Returns (cost, text) tuple.
    """
    if not abilities:
        return (0, "")

    # The ultimate is typically the most negative (most expensive) ability
    ultimate = min(abilities, key=lambda x: x[0])
    return ultimate


def fetch_all_planeswalkers() -> list[dict]:
    """Fetch all planeswalker cards from Scryfall API."""
    print("Fetching planeswalkers from Scryfall...")

    all_cards = []
    # Search for planeswalkers that have loyalty (excludes flip cards etc)
    url = f"{SCRYFALL_API}/cards/search?q=type:planeswalker+loyalty>0&unique=cards&order=name"

    page = 1
    while url:
        print(f"  Fetching page {page}...", end="\r")
        response = requests.get(url)

        if response.status_code != 200:
            print(f"\nError fetching from Scryfall: {response.status_code}")
            break

        data = response.json()
        all_cards.extend(data.get('data', []))

        # Check for more pages
        if data.get('has_more'):
            url = data.get('next_page')
            page += 1
            time.sleep(REQUEST_DELAY)  # Rate limiting
        else:
            url = None

    print(f"\nFetched {len(all_cards)} planeswalkers from Scryfall")
    return all_cards


def fetch_cubecobra_elo(card_name: str) -> float:
    """Fetch ELO rating from CubeCobra for a specific card."""
    try:
        # URL encode the card name
        encoded_name = quote(card_name, safe='')
        url = f"{CUBECOBRA_BASE}/tool/card/{encoded_name}"

        headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; PlaneswalkerFinder/1.0)'
        }

        response = requests.get(url, headers=headers, timeout=10)

        if response.status_code != 200:
            return 1200.0

        # Extract reactProps from HTML
        match = re.search(r'window\.reactProps\s*=\s*(\{.*?\});', response.text)
        if match:
            try:
                props = json.loads(match.group(1))
                elo = props.get('card', {}).get('elo', 1200.0)
                if elo and isinstance(elo, (int, float)):
                    return float(elo)
            except json.JSONDecodeError:
                pass

        return 1200.0

    except Exception as e:
        return 1200.0


def fetch_bulk_elo_from_topcards() -> dict[str, float]:
    """Fetch ELO ratings from CubeCobra top cards pages for planeswalkers."""
    print("Fetching ELO ratings from CubeCobra...")

    elo_map = {}
    page = 0
    max_pages = 20  # Safety limit

    headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; PlaneswalkerFinder/1.0)'
    }

    while page < max_pages:
        print(f"  Fetching CubeCobra page {page + 1}...", end="\r")

        try:
            url = f"{CUBECOBRA_BASE}/tool/topcards?f=type:planeswalker&p={page}&s=Elo"
            response = requests.get(url, headers=headers, timeout=15)

            if response.status_code != 200:
                break

            # Extract reactProps
            match = re.search(r'window\.reactProps\s*=\s*(\{.*?\})\s*;?\s*</script>',
                            response.text, re.DOTALL)

            if not match:
                # Try alternative pattern
                match = re.search(r'window\.reactProps\s*=\s*(\{.+?\});', response.text)

            if match:
                try:
                    props = json.loads(match.group(1))
                    cards = props.get('data', [])

                    if not cards:
                        break

                    for card in cards:
                        name = card.get('name', '')
                        elo = card.get('elo', 1200.0)
                        if name and elo:
                            elo_map[name] = float(elo)

                    # Check if there's more data
                    num_results = props.get('numResults', 0)
                    if len(elo_map) >= num_results or len(cards) < 100:
                        break

                except json.JSONDecodeError:
                    break
            else:
                break

            page += 1
            time.sleep(REQUEST_DELAY)

        except Exception as e:
            print(f"\n  Warning: Error fetching CubeCobra data: {e}")
            break

    print(f"\nFetched ELO for {len(elo_map)} planeswalkers from CubeCobra")
    return elo_map


def analyze_planeswalker(card: dict, elo_map: dict[str, float]) -> Optional[Planeswalker]:
    """Analyze a planeswalker card to determine if it can ultimate with Doubling Season."""

    name = card.get('name', '')
    oracle_text = card.get('oracle_text', '')
    loyalty_str = card.get('loyalty', '')

    # Skip cards without loyalty or oracle text
    if not loyalty_str or not oracle_text:
        return None

    # Handle X loyalty (like Nissa, Steward of Elements)
    try:
        if loyalty_str.upper() == 'X':
            # X loyalty planeswalkers - they can potentially ultimate with enough mana
            # We'll skip these or handle them specially
            return None
        starting_loyalty = int(loyalty_str)
    except ValueError:
        return None

    # Parse abilities
    abilities = parse_loyalty_abilities(oracle_text)

    if not abilities:
        return None

    # Find ultimate (most negative cost ability)
    ultimate_cost, ultimate_text = find_ultimate_cost(abilities)

    # If no negative ability found, skip (some planeswalkers have only + and 0)
    if ultimate_cost >= 0:
        return None

    # Calculate if can ultimate with Doubling Season
    loyalty_with_doubling = starting_loyalty * 2
    can_ultimate = loyalty_with_doubling >= abs(ultimate_cost)

    # Get image URI
    image_uri = ""
    if 'image_uris' in card:
        image_uri = card['image_uris'].get('normal', card['image_uris'].get('small', ''))
    elif 'card_faces' in card and card['card_faces']:
        face = card['card_faces'][0]
        if 'image_uris' in face:
            image_uri = face['image_uris'].get('normal', face['image_uris'].get('small', ''))

    # Get ELO from map
    elo = elo_map.get(name, 1200.0)

    return Planeswalker(
        name=name,
        mana_cost=card.get('mana_cost', ''),
        cmc=card.get('cmc', 0),
        colors=card.get('colors', []),
        starting_loyalty=starting_loyalty,
        loyalty_with_doubling=loyalty_with_doubling,
        ultimate_cost=ultimate_cost,
        ultimate_text=ultimate_text[:200] + "..." if len(ultimate_text) > 200 else ultimate_text,
        can_ultimate_with_doubling=can_ultimate,
        scryfall_uri=card.get('scryfall_uri', ''),
        image_uri=image_uri,
        elo=elo,
        set_name=card.get('set_name', ''),
        rarity=card.get('rarity', '')
    )


def generate_html_report(planeswalkers: list[Planeswalker]) -> str:
    """Generate a beautiful HTML report of the planeswalkers with image-focused card display."""

    # Sort by ELO (highest first)
    sorted_pws = sorted(planeswalkers, key=lambda x: x.elo, reverse=True)

    # Color mapping for mana symbols
    color_map = {
        'W': ('#F9FAF4', '#9E8959'),  # White
        'U': ('#0E68AB', '#FFFFFF'),  # Blue
        'B': ('#150B00', '#FFFFFF'),  # Black
        'R': ('#D3202A', '#FFFFFF'),  # Red
        'G': ('#00733E', '#FFFFFF'),  # Green
    }

    def get_color_style(colors):
        if not colors:
            return "background: linear-gradient(135deg, #888 0%, #666 100%); color: white;"
        if len(colors) == 1:
            bg, fg = color_map.get(colors[0], ('#888', '#FFF'))
            return f"background: {bg}; color: {fg};"
        # Multicolor
        gradients = [color_map.get(c, ('#888', '#FFF'))[0] for c in colors[:3]]
        return f"background: linear-gradient(135deg, {', '.join(f'{c} {i*100//len(gradients)}%' for i, c in enumerate(gradients))}); color: white;"

    def get_elo_tier(elo):
        if elo >= 1600:
            return "elo-high"
        elif elo >= 1400:
            return "elo-medium"
        return "elo-low"

    cards_html = ""
    for i, pw in enumerate(sorted_pws):
        rank = i + 1
        elo_class = get_elo_tier(pw.elo)

        cards_html += f'''
        <div class="card" data-elo="{pw.elo:.0f}" data-name="{pw.name}" data-colors="{','.join(pw.colors)}" data-loyalty="{pw.starting_loyalty}" data-cmc="{pw.cmc}">
            <div class="card-image-wrapper">
                <img src="{pw.image_uri}" alt="{pw.name}" loading="lazy" onerror="this.src='https://cards.scryfall.io/normal/front/0/0/00000000-0000-0000-0000-000000000000.jpg'">
                <div class="rank-badge">#{rank}</div>
                <div class="elo-badge {elo_class}">{pw.elo:.0f}</div>
            </div>
            <div class="card-overlay">
                <div class="card-name">{pw.name}</div>
                <div class="card-stats-mini">
                    <span class="loyalty-info">{pw.starting_loyalty} → {pw.loyalty_with_doubling}</span>
                    <span class="ultimate-cost">Ult: {pw.ultimate_cost}</span>
                </div>
                <a href="{pw.scryfall_uri}" target="_blank" class="scryfall-link">Scryfall →</a>
            </div>
            <div class="card-details-popup">
                <h4>{pw.name}</h4>
                <p class="mana-cost">{pw.mana_cost}</p>
                <div class="details-stats">
                    <div><strong>Starting:</strong> {pw.starting_loyalty}</div>
                    <div><strong>With Doubling:</strong> <span class="green">{pw.loyalty_with_doubling}</span></div>
                    <div><strong>Ultimate:</strong> {pw.ultimate_cost}</div>
                    <div><strong>ELO:</strong> <span class="{elo_class}">{pw.elo:.0f}</span></div>
                </div>
                <p class="ultimate-text"><strong>Ultimate:</strong> {pw.ultimate_text}</p>
                <p class="set-info">{pw.set_name} • {pw.rarity.title()}</p>
            </div>
        </div>
        '''

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Planeswalker Ultimate Finder - Doubling Season Combo</title>
    <style>
        :root {{
            --bg-dark: #1a1a2e;
            --bg-card: #16213e;
            --bg-sidebar: #0f1929;
            --accent: #e94560;
            --accent-light: #ff6b6b;
            --text: #eee;
            --text-muted: #aaa;
            --gold: #ffd700;
            --green: #4ade80;
            --blue: #60a5fa;
        }}

        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}

        body {{
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: var(--bg-dark);
            color: var(--text);
            min-height: 100vh;
            line-height: 1.6;
        }}

        /* Two-column main layout */
        .main-layout {{
            display: grid;
            grid-template-columns: 320px 1fr;
            min-height: 100vh;
        }}

        /* Left sidebar with info and filters */
        .sidebar {{
            background: var(--bg-sidebar);
            padding: 20px;
            border-right: 2px solid var(--accent);
            overflow-y: auto;
            position: sticky;
            top: 0;
            height: 100vh;
        }}

        .sidebar-header {{
            text-align: center;
            padding-bottom: 20px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            margin-bottom: 20px;
        }}

        .sidebar-header h1 {{
            font-size: 1.5rem;
            margin-bottom: 8px;
            background: linear-gradient(90deg, var(--accent), var(--gold));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }}

        .sidebar-header .subtitle {{
            color: var(--text-muted);
            font-size: 0.85rem;
        }}

        .stats-bar {{
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin: 15px 0;
        }}

        .stat-item {{
            text-align: center;
            background: rgba(255,255,255,0.05);
            padding: 10px 5px;
            border-radius: 8px;
        }}

        .stat-number {{
            font-size: 1.3rem;
            font-weight: bold;
            color: var(--gold);
        }}

        .stat-label {{
            font-size: 0.65rem;
            color: var(--text-muted);
        }}

        .explanation {{
            background: var(--bg-card);
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 20px;
            border-left: 3px solid var(--accent);
            font-size: 0.85rem;
        }}

        .explanation h2 {{
            color: var(--accent-light);
            margin-bottom: 8px;
            font-size: 1rem;
        }}

        .explanation p {{
            color: var(--text-muted);
            font-size: 0.8rem;
        }}

        .explanation code {{
            background: rgba(255,255,255,0.1);
            padding: 2px 5px;
            border-radius: 4px;
            color: var(--gold);
            font-size: 0.75rem;
        }}

        .filters {{
            display: flex;
            flex-direction: column;
            gap: 12px;
        }}

        .filter-group {{
            display: flex;
            flex-direction: column;
            gap: 5px;
        }}

        .filter-group label {{
            color: var(--text-muted);
            font-size: 0.8rem;
        }}

        select, input[type="text"] {{
            background: var(--bg-card);
            border: 1px solid #333;
            color: var(--text);
            padding: 10px 12px;
            border-radius: 8px;
            font-size: 0.9rem;
            width: 100%;
        }}

        select:focus, input:focus {{
            outline: none;
            border-color: var(--accent);
        }}

        /* Right side - Suggested Cards column */
        .cards-column {{
            padding: 20px;
            overflow-y: auto;
        }}

        .cards-column-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid var(--accent);
        }}

        .cards-column-header h2 {{
            font-size: 1.5rem;
            color: var(--accent-light);
        }}

        .cards-count {{
            background: var(--accent);
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: bold;
        }}

        /* Image-focused card grid */
        .cards-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
            gap: 20px;
        }}

        .card {{
            position: relative;
            border-radius: 12px;
            overflow: hidden;
            transition: transform 0.3s, box-shadow 0.3s;
            cursor: pointer;
        }}

        .card:hover {{
            transform: translateY(-8px) scale(1.02);
            box-shadow: 0 15px 40px rgba(233, 69, 96, 0.4);
            z-index: 10;
        }}

        .card-image-wrapper {{
            position: relative;
            aspect-ratio: 488 / 680;
            background: var(--bg-card);
        }}

        .card-image-wrapper img {{
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }}

        .rank-badge {{
            position: absolute;
            top: 8px;
            left: 8px;
            background: var(--accent);
            color: white;
            padding: 4px 10px;
            border-radius: 15px;
            font-weight: bold;
            font-size: 0.8rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }}

        .elo-badge {{
            position: absolute;
            top: 8px;
            right: 8px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 4px 10px;
            border-radius: 15px;
            font-weight: bold;
            font-size: 0.8rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }}

        .elo-badge.elo-high {{ color: var(--gold); }}
        .elo-badge.elo-medium {{ color: var(--blue); }}
        .elo-badge.elo-low {{ color: var(--text-muted); }}

        /* Card overlay on hover */
        .card-overlay {{
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(transparent, rgba(0,0,0,0.95));
            padding: 60px 12px 12px;
            opacity: 0;
            transition: opacity 0.3s;
        }}

        .card:hover .card-overlay {{
            opacity: 1;
        }}

        .card-name {{
            font-weight: bold;
            font-size: 0.95rem;
            margin-bottom: 5px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }}

        .card-stats-mini {{
            display: flex;
            gap: 12px;
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-bottom: 8px;
        }}

        .loyalty-info {{
            color: var(--green);
        }}

        .ultimate-cost {{
            color: var(--accent-light);
        }}

        .card-overlay .scryfall-link {{
            color: var(--accent-light);
            text-decoration: none;
            font-size: 0.75rem;
        }}

        .card-overlay .scryfall-link:hover {{
            text-decoration: underline;
        }}

        /* Details popup on click */
        .card-details-popup {{
            display: none;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--bg-card);
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            z-index: 1000;
            max-width: 400px;
            width: 90%;
            border: 2px solid var(--accent);
        }}

        .card-details-popup.active {{
            display: block;
        }}

        .card-details-popup h4 {{
            color: var(--accent-light);
            margin-bottom: 10px;
            font-size: 1.2rem;
        }}

        .card-details-popup .mana-cost {{
            color: var(--text-muted);
            margin-bottom: 15px;
        }}

        .details-stats {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 15px;
            background: rgba(255,255,255,0.05);
            padding: 10px;
            border-radius: 8px;
        }}

        .details-stats .green {{ color: var(--green); }}
        .details-stats .elo-high {{ color: var(--gold); }}
        .details-stats .elo-medium {{ color: var(--blue); }}
        .details-stats .elo-low {{ color: var(--text-muted); }}

        .card-details-popup .ultimate-text {{
            font-size: 0.85rem;
            color: var(--text-muted);
            margin-bottom: 10px;
            padding: 10px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
        }}

        .card-details-popup .ultimate-text strong {{
            color: var(--accent-light);
        }}

        .card-details-popup .set-info {{
            font-size: 0.8rem;
            color: var(--text-muted);
        }}

        .overlay-bg {{
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.7);
            z-index: 999;
        }}

        .overlay-bg.active {{
            display: block;
        }}

        footer {{
            text-align: center;
            padding: 20px;
            color: var(--text-muted);
            font-size: 0.8rem;
            border-top: 1px solid rgba(255,255,255,0.1);
        }}

        footer a {{
            color: var(--accent-light);
        }}

        .no-results {{
            text-align: center;
            padding: 60px;
            color: var(--text-muted);
            grid-column: 1 / -1;
        }}

        /* Responsive design */
        @media (max-width: 900px) {{
            .main-layout {{
                grid-template-columns: 1fr;
            }}

            .sidebar {{
                position: relative;
                height: auto;
                border-right: none;
                border-bottom: 2px solid var(--accent);
            }}

            .stats-bar {{
                grid-template-columns: repeat(3, 1fr);
            }}

            .cards-grid {{
                grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            }}
        }}

        @media (max-width: 480px) {{
            .cards-grid {{
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
            }}

            .sidebar-header h1 {{
                font-size: 1.2rem;
            }}
        }}
    </style>
</head>
<body>
    <div class="main-layout">
        <!-- Left Sidebar -->
        <aside class="sidebar">
            <div class="sidebar-header">
                <h1>Planeswalker Ultimate Finder</h1>
                <p class="subtitle">Doubling Season Combos</p>
            </div>

            <div class="stats-bar">
                <div class="stat-item">
                    <div class="stat-number">{len(sorted_pws)}</div>
                    <div class="stat-label">Total Cards</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">{max(pw.elo for pw in sorted_pws) if sorted_pws else 0:.0f}</div>
                    <div class="stat-label">Top ELO</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">{sum(pw.elo for pw in sorted_pws) / len(sorted_pws) if sorted_pws else 0:.0f}</div>
                    <div class="stat-label">Avg ELO</div>
                </div>
            </div>

            <div class="explanation">
                <h2>How It Works</h2>
                <p>
                    <strong>Doubling Season</strong> doubles starting loyalty counters.
                    Ultimate if: <code>Loyalty × 2 ≥ |Cost|</code>
                </p>
            </div>

            <div class="filters">
                <div class="filter-group">
                    <label for="search">Search</label>
                    <input type="text" id="search" placeholder="Filter by name...">
                </div>
                <div class="filter-group">
                    <label for="sort">Sort by</label>
                    <select id="sort">
                        <option value="elo-desc">ELO (Highest First)</option>
                        <option value="elo-asc">ELO (Lowest First)</option>
                        <option value="name-asc">Name (A-Z)</option>
                        <option value="loyalty-desc">Loyalty (Highest)</option>
                        <option value="cmc-asc">Mana Cost (Lowest)</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label for="color">Color</label>
                    <select id="color">
                        <option value="all">All Colors</option>
                        <option value="W">White</option>
                        <option value="U">Blue</option>
                        <option value="B">Black</option>
                        <option value="R">Red</option>
                        <option value="G">Green</option>
                        <option value="multi">Multicolor</option>
                        <option value="colorless">Colorless</option>
                    </select>
                </div>
            </div>

            <footer>
                <p>Data from <a href="https://scryfall.com" target="_blank">Scryfall</a> & <a href="https://cubecobra.com" target="_blank">CubeCobra</a></p>
            </footer>
        </aside>

        <!-- Right Side - Suggested Cards Column -->
        <main class="cards-column">
            <div class="cards-column-header">
                <h2>Suggested Cards</h2>
                <span class="cards-count" id="cards-count">{len(sorted_pws)} cards</span>
            </div>

            <div class="cards-grid" id="cards-container">
                {cards_html}
            </div>
        </main>
    </div>

    <div class="overlay-bg" id="overlay-bg"></div>

    <script>
        const container = document.getElementById('cards-container');
        const cardsCountEl = document.getElementById('cards-count');
        const overlayBg = document.getElementById('overlay-bg');

        // Card click handler for details popup
        container.addEventListener('click', function(e) {{
            const card = e.target.closest('.card');
            if (card && !e.target.closest('.scryfall-link')) {{
                const popup = card.querySelector('.card-details-popup');
                if (popup) {{
                    popup.classList.toggle('active');
                    overlayBg.classList.toggle('active');
                }}
            }}
        }});

        overlayBg.addEventListener('click', function() {{
            document.querySelectorAll('.card-details-popup.active').forEach(p => p.classList.remove('active'));
            overlayBg.classList.remove('active');
        }});

        function filterAndSort() {{
            const searchTerm = document.getElementById('search').value.toLowerCase();
            const sortBy = document.getElementById('sort').value;
            const colorFilter = document.getElementById('color').value;

            const cardElements = Array.from(container.querySelectorAll('.card'));

            // Filter cards
            let filtered = cardElements.filter(el => {{
                const name = el.dataset.name.toLowerCase();
                const colors = el.dataset.colors ? el.dataset.colors.split(',') : [];
                const matchesSearch = name.includes(searchTerm);

                let matchesColor = true;
                if (colorFilter !== 'all') {{
                    if (colorFilter === 'multi') {{
                        matchesColor = colors.length > 1;
                    }} else if (colorFilter === 'colorless') {{
                        matchesColor = colors.length === 0 || colors[0] === '';
                    }} else {{
                        matchesColor = colors.includes(colorFilter);
                    }}
                }}

                return matchesSearch && matchesColor;
            }});

            // Sort cards
            filtered.sort((a, b) => {{
                switch(sortBy) {{
                    case 'elo-desc': return parseFloat(b.dataset.elo) - parseFloat(a.dataset.elo);
                    case 'elo-asc': return parseFloat(a.dataset.elo) - parseFloat(b.dataset.elo);
                    case 'name-asc': return a.dataset.name.localeCompare(b.dataset.name);
                    case 'loyalty-desc': return parseInt(b.dataset.loyalty) - parseInt(a.dataset.loyalty);
                    case 'cmc-asc': return parseFloat(a.dataset.cmc) - parseFloat(b.dataset.cmc);
                    default: return 0;
                }}
            }});

            // Hide all cards first
            cardElements.forEach(card => card.style.display = 'none');

            // Show and reorder filtered cards
            filtered.forEach((card, i) => {{
                const rank = card.querySelector('.rank-badge');
                if (rank) rank.textContent = '#' + (i + 1);
                card.style.display = '';
                container.appendChild(card);
            }});

            // Update count
            cardsCountEl.textContent = filtered.length + ' cards';

            if (filtered.length === 0) {{
                container.innerHTML = '<div class="no-results">No planeswalkers match your filters</div>';
            }}
        }}

        document.getElementById('search').addEventListener('input', filterAndSort);
        document.getElementById('sort').addEventListener('change', filterAndSort);
        document.getElementById('color').addEventListener('change', filterAndSort);
    </script>
</body>
</html>'''

    return html


def main():
    print("=" * 60)
    print("  PLANESWALKER ULTIMATE FINDER - DOUBLING SEASON COMBO")
    print("=" * 60)
    print()

    # Fetch all planeswalkers from Scryfall
    cards = fetch_all_planeswalkers()

    if not cards:
        print("Error: Could not fetch planeswalkers from Scryfall")
        return

    # Fetch ELO ratings from CubeCobra
    elo_map = fetch_bulk_elo_from_topcards()

    # Analyze each planeswalker
    print("\nAnalyzing planeswalkers...")
    planeswalkers = []
    can_ultimate_count = 0

    for card in cards:
        pw = analyze_planeswalker(card, elo_map)
        if pw and pw.can_ultimate_with_doubling:
            planeswalkers.append(pw)
            can_ultimate_count += 1

    print(f"\nFound {can_ultimate_count} planeswalkers that can ultimate with Doubling Season!")

    # Fetch individual ELO for cards not in bulk data
    missing_elo = [pw for pw in planeswalkers if pw.elo == 1200.0]
    if missing_elo:
        print(f"\nFetching individual ELO for {len(missing_elo)} cards...")
        for i, pw in enumerate(missing_elo):
            print(f"  [{i+1}/{len(missing_elo)}] {pw.name}...", end="\r")
            pw.elo = fetch_cubecobra_elo(pw.name)
            time.sleep(REQUEST_DELAY)
        print()

    # Sort by ELO
    planeswalkers.sort(key=lambda x: x.elo, reverse=True)

    # Print top 10
    print("\n" + "=" * 60)
    print("  TOP 10 BY CUBECOBRA ELO")
    print("=" * 60)

    for i, pw in enumerate(planeswalkers[:10]):
        print(f"\n{i+1}. {pw.name}")
        print(f"   ELO: {pw.elo:.0f} | Loyalty: {pw.starting_loyalty} → {pw.loyalty_with_doubling} | Ultimate: {pw.ultimate_cost}")
        print(f"   Mana: {pw.mana_cost}")

    # Generate HTML report
    print("\n" + "=" * 60)
    print("  GENERATING HTML REPORT")
    print("=" * 60)

    html = generate_html_report(planeswalkers)

    output_file = "planeswalker_ultimate_report.html"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"\n✓ Report saved to: {output_file}")
    print(f"✓ Total planeswalkers that can ultimate: {len(planeswalkers)}")
    print(f"✓ Open the HTML file in a browser to view the interactive report!")

    return planeswalkers


if __name__ == "__main__":
    main()
