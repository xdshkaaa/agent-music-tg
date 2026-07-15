## ADDED Requirements

### Requirement: Header uses Nocturne navigation styling
The app header/navigation SHALL use Nocturne `.nav` and `.nav-brand` patterns on the dark tokenized ground. Header styling SHALL NOT depend on liquid-glass blur, backdrop filters, or glass highlight overlays.

#### Scenario: Header uses nav classes
- **WHEN** inspecting the app header markup
- **THEN** it SHALL use Nocturne navigation classes where applicable

#### Scenario: Header avoids glass effects
- **WHEN** inspecting header styles
- **THEN** the header SHALL NOT use backdrop-filter, saturating blur, or glass highlight overlays
