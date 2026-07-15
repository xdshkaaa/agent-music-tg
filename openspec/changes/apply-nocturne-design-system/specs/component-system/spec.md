## ADDED Requirements

### Requirement: Components use Nocturne tokens and classes
Shared UI components SHALL consume Nocturne variables and component classes for visual styling. Components SHALL NOT introduce parallel color, spacing, radius, shadow, or typography systems when the Nocturne stylesheet provides the needed token or class.

#### Scenario: Component styling resolves to Nocturne
- **WHEN** inspecting shared component markup and styles
- **THEN** visual styling SHALL resolve through Nocturne classes or variables

#### Scenario: No conflicting component palette
- **WHEN** searching app-authored component CSS
- **THEN** components SHALL NOT define a conflicting palette for surfaces, text, accent, or borders
