## 1. Setup and Asset Wiring

- [x] 1.1 Confirm the affected HTML files and the Nocturne design-system asset paths from each page location
- [x] 1.2 Link the provided Nocturne `styles.css` from each affected HTML page using a valid relative path
- [x] 1.3 Preserve existing JavaScript behavior hooks before changing visual class names or component markup

## 2. Visual Foundation Migration

- [x] 2.1 Replace legacy liquid/glass page background, surface, text, border, radius, and shadow styling with Nocturne tokens
- [x] 2.2 Remove or bypass conflicting backdrop-filter, blur, saturate, glass highlight, and stacked glass shadow effects on converted surfaces
- [x] 2.3 Replace app-authored hard-coded visual values with Nocturne CSS variables where equivalent tokens exist
- [x] 2.4 Ensure the app uses Nocturne Inter typography variables for body and heading text

## 3. Component Conversion

- [x] 3.1 Convert primary, secondary, ghost, block, and icon actions to Nocturne `.btn` classes and variants
- [x] 3.2 Convert labels and badges to Nocturne `.tag` variants
- [x] 3.3 Convert content panels to Nocturne `.card` structure and elevation utilities where applicable
- [x] 3.4 Convert form controls to Nocturne `.field`, `.input`, `.radio`, `.dot`, `.seg`, and `.seg-opt` classes where applicable
- [x] 3.5 Convert tables and dialogs to Nocturne `.table`, `.dialog-backdrop`, `.dialog`, and dialog sub-classes where applicable
- [x] 3.6 Convert the header/navigation to Nocturne `.nav` and `.nav-brand` patterns without glass effects

## 4. Interaction and Imagery

- [x] 4.1 Verify hover and pressed states use Nocturne accent-ramp treatments rather than browser defaults or legacy glass styles
- [x] 4.2 Verify keyboard focus uses the Nocturne 2px accent `:focus-visible` outline with offset
- [x] 4.3 Verify disabled controls use the Nocturne disabled opacity treatment
- [x] 4.4 Wrap hero and inline content photographs with the Nocturne `.lighten` image treatment where applicable
- [x] 4.5 Ensure accent usage remains outlined or subtle and does not flood large areas except sanctioned section/stat-band treatments

## 5. Documentation and Verification

- [x] 5.1 Update project documentation to state that the mini-app consumes the Nocturne design system
- [x] 5.2 Search affected files for remaining hard-coded colors, legacy font stacks, unsupported shadows, blur filters, and oversized pill radii
- [x] 5.3 Manually verify the affected screens render with the Nocturne dark ground, compact spacing, outlined actions, and themed states
- [x] 5.4 Run any available lint, format, or validation checks for the edited project files
