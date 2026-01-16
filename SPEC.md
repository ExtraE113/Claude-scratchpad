# MTG Cube Growth Tool - V1 Specification

## 1. Overview

### 1.1 Purpose
The Cube Growth Tool enables organic MTG cube design through iterative card discovery. Instead of top-down cube construction, users "grow" a cube by:
1. Providing seed cards they want to build around
2. Receiving contextual recommendations for related cards
3. Accepting recommendations to expand the cube
4. Visualizing the emerging structure as an interactive graph

### 1.2 Core Concept
The cube is modeled as a **graph** where:
- **Nodes** represent cards (strict identity: each card appears exactly once)
- **Edges** represent relatedness/synergy between cards

When the same card is recommended from multiple sources (e.g., Entomb recommended by both a flashback theme and a reanimator theme), it creates a natural convergence point in the graph, revealing the cube's structural "glue."

### 1.3 V1 Scope
| In Scope | Out of Scope |
|----------|--------------|
| Core graph data model | Persistence (save/load) |
| EDHREC-based recommender | CubeCobra import/export |
| Interactive graph visualization | Alternative recommender sources |
| Manual card/edge management | Budget/format filtering |
| Scryfall card search | Archetype tagging |

---

## 2. Data Model

### 2.1 Card
Represents a unique Magic card in the cube.

```typescript
interface Card {
  // Identity
  oracleId: string;          // Scryfall oracle_id (unique per game piece)
  name: string;              // Card name

  // Display
  imageUri: string;          // Card image URL (normal size)
  artCropUri: string;        // Art crop for compact display

  // Metadata
  manaCost: string;          // e.g., "{2}{B}{B}"
  cmc: number;               // Converted mana cost
  colors: string[];          // e.g., ["B"]
  colorIdentity: string[];   // e.g., ["B"]
  typeLine: string;          // e.g., "Creature — Zombie"
  oracleText: string;        // Rules text

  // Optional
  power?: string;
  toughness?: string;
  loyalty?: string;
}
```

### 2.2 CubeGraph
The core data structure representing the cube.

```typescript
interface CubeGraph {
  // Nodes: oracleId -> Card
  nodes: Map<string, Card>;

  // Edges: Set of "id1|id2" strings where id1 < id2 (lexicographic)
  // This ensures each edge is stored once regardless of direction
  edges: Set<string>;
}
```

### 2.3 Edge Key Format
Edges are undirected. To ensure uniqueness, edge keys are constructed by sorting the two oracle IDs lexicographically:

```typescript
function makeEdgeKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}
```

### 2.4 Recommendation
A recommendation returned by the recommender system.

```typescript
interface Recommendation {
  card: Card;
  score: number;              // 0-100, higher = more relevant
  reason?: string;            // Optional explanation
  alreadyInGraph: boolean;    // True if card already exists in cube
}
```

---

## 3. Graph Operations

### 3.1 Add Card
Add a new card to the graph as a disconnected node.

```
addCard(graph, card) -> graph'
  Precondition: card.oracleId not in graph.nodes
  Postcondition: graph'.nodes contains card
  Postcondition: graph'.edges unchanged
```

Used when: Adding a seed card, or adding a recommended card without connecting it.

### 3.2 Add Connection
Create an edge between two existing cards.

```
addConnection(graph, cardA, cardB) -> graph'
  Precondition: cardA.oracleId in graph.nodes
  Precondition: cardB.oracleId in graph.nodes
  Precondition: cardA.oracleId != cardB.oracleId
  Postcondition: graph'.edges contains makeEdgeKey(cardA.oracleId, cardB.oracleId)
```

Used when: Connecting an existing card to another, or when accepting a recommendation with "Add + Connect."

### 3.3 Remove Card
Remove a card and all its edges from the graph.

```
removeCard(graph, card) -> graph'
  Precondition: card.oracleId in graph.nodes
  Postcondition: card.oracleId not in graph'.nodes
  Postcondition: No edges in graph'.edges contain card.oracleId
```

Cards that were only connected through the removed card become disconnected (roots). They are **not** cascade-deleted.

### 3.4 Remove Connection
Remove an edge between two cards.

```
removeConnection(graph, cardA, cardB) -> graph'
  Precondition: makeEdgeKey(cardA.oracleId, cardB.oracleId) in graph.edges
  Postcondition: makeEdgeKey(cardA.oracleId, cardB.oracleId) not in graph'.edges
  Postcondition: Both cards remain in graph'.nodes
```

### 3.5 Get Neighbors
Get the n nearest cards to a given card via BFS.

```
getNeighbors(graph, card, n) -> Card[]
  Returns up to n cards, ordered by distance from card (BFS order)
  Does not include the source card itself
```

### 3.6 Get Card Degree
Return the number of edges connected to a card.

```
getDegree(graph, card) -> number
```

Cards with degree 0 are "roots" (seeds or orphaned cards).
Cards with high degree are "hubs" (bridge multiple themes).

---

## 4. Recommender System

### 4.1 Data Source: EDHREC
The V1 recommender uses the EDHREC recommendations API.

**Endpoint**: `POST https://edhrec.com/api/recs`

**Request Format**:
```json
{
  "cards": ["Card Name 1", "Card Name 2", ...],
  "commanders": ["Kenrith, the Returned King"],
  "name": "",
  "options": {
    "excludeLands": false,
    "offset": 0
  }
}
```

**Response Format**:
```json
{
  "inRecs": [
    {
      "name": "Recommended Card",
      "oracle_id": "...",
      "primary_type": "Creature",
      "score": 85,
      "salt": 0.5
    },
    ...
  ],
  "outRecs": [...],
  "more": true
}
```

### 4.2 Commander Requirement
EDHREC requires a commander. We use **Kenrith, the Returned King** as a neutral 5-color option that doesn't restrict color identity.

**Known Limitation**: This biases recommendations toward 5-color "goodstuff" cards. Commander-specific cards are filtered out (see 4.5).

### 4.3 Context Building Algorithm
When requesting recommendations for a card, we build a context of up to 20 cards:

```
buildContext(graph, sourceCard) -> Card[]
  context = []

  // Step 1: BFS from source card
  neighbors = getNeighbors(graph, sourceCard, 20)
  context.push(...neighbors)

  // Step 2: If < 20, add random cards from graph
  if context.length < 20:
    remaining = graph.nodes.values()
      .filter(c => c not in context and c != sourceCard)
    shuffled = shuffle(remaining)
    context.push(...shuffled.slice(0, 20 - context.length))

  return context
```

### 4.4 Recommendation Request Flow
```
getRecommendations(graph, sourceCard) -> Recommendation[]
  1. context = buildContext(graph, sourceCard)

  2. cardNames = [sourceCard.name, ...context.map(c => c.name)]

  3. response = POST edhrec/api/recs {
       cards: cardNames,
       commanders: ["Kenrith, the Returned King"],
       ...
     }

  4. recommendations = response.inRecs
       .filter(r => !isCommanderOnlyCard(r.name))
       .map(r => ({
         card: fetchCardFromScryfall(r.name),
         score: r.score,
         alreadyInGraph: graph.nodes.has(r.oracle_id)
       }))
       .slice(0, 10)

  5. return recommendations
```

### 4.5 Commander-Only Card Filter
The following cards are filtered from recommendations as they're Commander-specific:

```typescript
const COMMANDER_ONLY_CARDS = new Set([
  "Command Tower",
  "Arcane Signet",
  "Commander's Sphere",
  "Command Beacon",
  "Opal Palace",
  "Path of Ancestry",
  // ... extend as needed
]);

const COMMANDER_TEXT_PATTERNS = [
  /\bcommander\b/i,
  /\bcommand zone\b/i,
];

function isCommanderOnlyCard(cardName: string, oracleText?: string): boolean {
  if (COMMANDER_ONLY_CARDS.has(cardName)) return true;
  if (oracleText) {
    return COMMANDER_TEXT_PATTERNS.some(p => p.test(oracleText));
  }
  return false;
}
```

### 4.6 Rate Limiting
- Minimum 100ms delay between EDHREC requests
- Requests are queued and processed sequentially
- Failed requests are retried once after 1 second

---

## 5. Card Data (Scryfall Integration)

### 5.1 Card Search
For seed input and manual card addition, we use Scryfall's autocomplete API.

**Endpoint**: `GET https://api.scryfall.com/cards/autocomplete?q={query}`

**Response**: Array of card name strings (up to 20 results)

### 5.2 Card Fetch
To get full card data, we fetch by exact name.

**Endpoint**: `GET https://api.scryfall.com/cards/named?exact={name}`

**Response**: Full Scryfall card object

### 5.3 Field Mapping
```typescript
function scryfallToCard(sf: ScryfallCard): Card {
  return {
    oracleId: sf.oracle_id,
    name: sf.name,
    imageUri: sf.image_uris?.normal ?? sf.card_faces?.[0]?.image_uris?.normal,
    artCropUri: sf.image_uris?.art_crop ?? sf.card_faces?.[0]?.image_uris?.art_crop,
    manaCost: sf.mana_cost ?? sf.card_faces?.[0]?.mana_cost ?? "",
    cmc: sf.cmc,
    colors: sf.colors ?? [],
    colorIdentity: sf.color_identity,
    typeLine: sf.type_line,
    oracleText: sf.oracle_text ?? sf.card_faces?.map(f => f.oracle_text).join("\n\n") ?? "",
    power: sf.power,
    toughness: sf.toughness,
    loyalty: sf.loyalty,
  };
}
```

### 5.4 Rate Limiting
- Maximum 10 requests per second to Scryfall
- Batch requests where possible using `/cards/collection` endpoint

---

## 6. User Interface

### 6.1 Layout
```
┌─────────────────────────────────────────────────────────────────┐
│  [+ Add Seed Card]                              Cube: 47 cards  │
├───────────────────────────────────────────┬─────────────────────┤
│                                           │                     │
│                                           │  Selected Card      │
│                                           │  ┌─────────────┐    │
│           Graph Visualization             │  │  [Card Img] │    │
│                                           │  └─────────────┘    │
│              (D3.js force-directed)       │  Card Name          │
│                                           │  {2}{B}{B} Creature │
│                                           │                     │
│                                           ├─────────────────────┤
│                                           │  Recommendations    │
│                                           │  ┌───┐ Card A  [+]  │
│                                           │  └───┘ Score: 85    │
│                                           │  ┌───┐ Card B  [+]  │
│                                           │  └───┘ Score: 72    │
│                                           │  ...                │
└───────────────────────────────────────────┴─────────────────────┘
```

### 6.2 Graph Visualization

#### 6.2.1 Layout
- **Algorithm**: D3.js force-directed simulation
- **Forces**:
  - `forceLink`: Edges attract connected nodes
  - `forceManyBody`: Nodes repel each other (prevents overlap)
  - `forceCenter`: Centers the graph in the viewport
  - `forceCollide`: Prevents node overlap based on node radius

#### 6.2.2 Node Rendering
- **Default**: Small circle with card's primary color
- **Hover**: Show card art crop or full image tooltip
- **Selected**: Highlighted border, slightly larger
- **Size variation**: Optionally scale by degree (hubs appear larger)

#### 6.2.3 Edge Rendering
- **Style**: Simple lines, no arrows (undirected)
- **Color**: Neutral gray, or colored by shared colors between cards
- **Hover**: Highlight edge and connected nodes

#### 6.2.4 Interactions
| Action | Result |
|--------|--------|
| Click node | Select card, show in panel, fetch recommendations |
| Drag node | Move node, simulation adjusts |
| Scroll | Zoom in/out |
| Pan (drag background) | Move viewport |
| Right-click node | Context menu: Remove card, Connect to... |
| Hover node | Show card preview tooltip |

#### 6.2.5 Visual Indicators
- **Roots** (degree ≤ 1): Dashed border or special icon
- **Hubs** (degree ≥ 4): Larger size, glow effect
- **Disconnected clusters**: Visually separated by simulation

### 6.3 Seed Input Component

#### 6.3.1 Behavior
1. User types card name
2. Autocomplete dropdown appears (Scryfall results)
3. User selects card
4. Card is added to graph as disconnected node
5. Card is automatically selected, recommendations fetched

#### 6.3.2 Validation
- Card must exist in Scryfall
- Card cannot already be in graph (show message if duplicate)

### 6.4 Card Detail Panel

Shows when a card is selected in the graph.

#### 6.4.1 Content
- Card image (full size)
- Card name
- Mana cost (rendered with mana symbols)
- Type line
- Oracle text
- Power/toughness or loyalty (if applicable)
- Degree in graph (number of connections)

#### 6.4.2 Actions
- **Remove from cube**: Deletes card and its edges
- **Connect to...**: Opens card picker to create manual edge

### 6.5 Recommendations Panel

Shows recommendations for the selected card.

#### 6.5.1 Recommendation Item
```
┌───────────────────────────────────────────┐
│ [Art]  Card Name                    [+]   │
│        Score: 85                          │
│        {2}{B}{B} Creature — Zombie        │
└───────────────────────────────────────────┘
```

#### 6.5.2 Actions per Recommendation

**If card is NOT in graph**:
- **[+] Add**: Add card as disconnected node
- **[+ Connect] Add & Connect**: Add card and create edge to source

**If card IS in graph**:
- **[Link] Add Connection**: Create edge between source and existing card
- Visual indicator that card is already in cube

#### 6.5.3 States
- **Loading**: Show spinner while fetching from EDHREC
- **Empty**: "No recommendations found" message
- **Error**: Retry button with error message

### 6.6 Manual Edge Creation

Triggered from "Connect to..." action on a card.

#### 6.6.1 Flow
1. User clicks "Connect to..." on Card A
2. Modal or inline picker appears with all other cards in graph
3. User searches/selects Card B
4. Edge is created between A and B
5. Graph updates to show new edge

---

## 7. Technical Architecture

### 7.1 Technology Stack
| Layer | Technology |
|-------|------------|
| Framework | React 18+ |
| Language | TypeScript 5+ |
| Build | Vite |
| Graph Viz | D3.js v7 |
| Styling | CSS Modules or Tailwind |
| State | React Context + useReducer |

### 7.2 Project Structure
```
src/
├── components/
│   ├── App.tsx
│   ├── GraphView/
│   │   ├── GraphView.tsx
│   │   ├── useForceSimulation.ts
│   │   └── GraphView.module.css
│   ├── CardNode/
│   │   ├── CardNode.tsx
│   │   └── CardNode.module.css
│   ├── CardPanel/
│   │   ├── CardPanel.tsx
│   │   └── CardPanel.module.css
│   ├── RecommendationPanel/
│   │   ├── RecommendationPanel.tsx
│   │   ├── RecommendationItem.tsx
│   │   └── RecommendationPanel.module.css
│   ├── SeedInput/
│   │   ├── SeedInput.tsx
│   │   └── SeedInput.module.css
│   └── common/
│       ├── ManaSymbols.tsx
│       └── CardPreview.tsx
├── lib/
│   ├── graph.ts           # Graph data structure
│   ├── graph.test.ts      # Graph unit tests
│   ├── recommender.ts     # EDHREC integration
│   ├── scryfall.ts        # Scryfall API client
│   └── commanderFilter.ts # Commander-only card list
├── context/
│   ├── CubeContext.tsx    # Global cube state
│   └── cubeReducer.ts     # State reducer
├── types/
│   └── index.ts
├── index.tsx
└── index.css
```

### 7.3 State Management

```typescript
interface CubeState {
  graph: CubeGraph;
  selectedCardId: string | null;
  recommendations: Recommendation[];
  isLoadingRecs: boolean;
  recsError: string | null;
}

type CubeAction =
  | { type: 'ADD_CARD'; card: Card }
  | { type: 'REMOVE_CARD'; oracleId: string }
  | { type: 'ADD_CONNECTION'; idA: string; idB: string }
  | { type: 'REMOVE_CONNECTION'; idA: string; idB: string }
  | { type: 'SELECT_CARD'; oracleId: string | null }
  | { type: 'SET_RECOMMENDATIONS'; recs: Recommendation[] }
  | { type: 'SET_LOADING_RECS'; loading: boolean }
  | { type: 'SET_RECS_ERROR'; error: string | null };
```

### 7.4 CORS Handling
EDHREC may block browser requests. Options:
1. **Proxy through Vite dev server** (development only)
2. **CORS proxy service** (e.g., cors-anywhere, allorigins)
3. **Backend proxy** (future: if we add a server)

For V1, use Vite proxy in development:
```typescript
// vite.config.ts
export default {
  server: {
    proxy: {
      '/api/edhrec': {
        target: 'https://edhrec.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/edhrec/, '/api'),
      },
    },
  },
};
```

---

## 8. Error Handling

### 8.1 API Errors
| Error | Handling |
|-------|----------|
| EDHREC rate limit | Retry after delay, show message |
| EDHREC unavailable | Show error, allow retry |
| Scryfall card not found | Show "Card not found" in autocomplete |
| Network error | Show error toast, allow retry |

### 8.2 User Errors
| Error | Handling |
|-------|----------|
| Add duplicate card | Show message: "Card already in cube" |
| Connect card to itself | Prevent action (button disabled) |
| Remove last connection to cluster | Allow (cards become roots) |

---

## 9. Future Considerations (Not V1)

These features are explicitly out of scope but inform V1 design decisions:

1. **Persistence**: Save/load cube state to localStorage or backend
2. **Import/Export**: CubeCobra CSV import, export current cube
3. **Multiple recommenders**: Blend EDHREC, CubeCobra, card2vec
4. **Filtering**: Budget limits, format legality, color restrictions
5. **Archetype detection**: Auto-tag clusters as "Reanimator", "Burn", etc.
6. **Undo/Redo**: Action history for cube modifications
7. **Collaboration**: Share cube links, collaborative editing

---

## 10. Acceptance Criteria

### 10.1 Core Functionality
- [ ] Can add a seed card by name
- [ ] Added card appears as node in graph
- [ ] Clicking a node selects it and shows card details
- [ ] Recommendations load for selected card
- [ ] Can accept a recommendation (adds card + edge)
- [ ] Can add connection to existing card from recommendation
- [ ] Can manually connect two existing cards
- [ ] Can remove a card from the cube
- [ ] Graph layout responds to changes in real-time

### 10.2 Visualization
- [ ] Graph renders with force-directed layout
- [ ] Nodes are draggable
- [ ] Graph is zoomable and pannable
- [ ] Hover shows card preview
- [ ] Selected card is visually distinct
- [ ] Edges render as simple lines

### 10.3 Recommendations
- [ ] Recommendations use card + neighbors as context
- [ ] Commander-only cards are filtered out
- [ ] Already-in-cube cards are marked distinctly
- [ ] Loading and error states are handled

### 10.4 Edge Cases
- [ ] Empty graph state is handled gracefully
- [ ] Single-card graph works correctly
- [ ] Removing a hub card correctly orphans connected cards
- [ ] Very large graphs (100+ cards) remain performant
