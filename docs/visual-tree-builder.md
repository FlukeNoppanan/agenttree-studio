# Visual Tree Builder

Open **Trees → Create Blank Tree**, or choose **Visual Builder** on an existing Tree. Template Setup and Advanced Editor remain available.

1. Add Root. A Tree has exactly one Root.
2. Drag Managers onto the Canvas and connect Root's lower port to each Manager's upper port.
3. Add Specialists and connect each to a Manager. Dropping an Agent directly onto a valid parent also establishes that relationship.
4. Select an Agent's name to configure its capabilities, instructions and Provider/Model. Use the existing Tools/MCP catalog to attach actual resources.
5. Check backend readiness issues below the Canvas. Select an Agent issue to open its configuration.
6. **Save** keeps a draft; **Save & mark Ready** uses existing backend readiness. A Ready Tree edit must remain valid and saves a new immutable version.

Solid lines express hierarchy. Dashed lines attach resources. Provider/Model bindings are metadata, not execution nodes.

Use Fit View, zoom, pan and Auto Layout to navigate. Shift-click or Shift-drag selects a group. Delete confirms subtree removal; removing a Tool attachment does not delete the shared Tool. Undo/Redo recover unsaved edits. Text input and dialog focus are protected from Canvas keyboard shortcuts.

Configuration requires explicit Save. Navigation offers Save, Discard or Stay; browser reload warns about unsaved configuration. Positions and collapse preferences are stored only in this browser, per account/Tree/version. A new Ready version receives new Agent IDs and starts with a fresh layout. Browser layout preferences contain no secrets or credentials.

The Builder does not run a new engine. Run and Connect continue through the existing Studio interfaces. Live execution decoration belongs to the next Playground phase.
