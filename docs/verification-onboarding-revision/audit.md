# Audit before revision

Studio HEAD 4086b80. Prior integration/onboarding implementation is uncommitted and preserved. Core git status clean. Inspected shell, authentication/route guards, Dashboard, guide/preferences/tests, current Dashboard contracts, theme tokens/primitives, i18n and EN/TH copy, workspace/setup/Run/Connect paths.

Guide currently dominates Dashboard, stores only collapse/Connect acknowledgement and automatically picks a draft or first runnable Tree. Existing /api/dashboard/me supplies setup Trees and current granted available_trees; no new Tree API is needed. Backend readiness and successful Run rules remain authoritative. Configure permissions cover workspace Trees; Run/Connect additionally require current grants.

Shell mounts after authenticated entry and forced-password handling, making it the Welcome boundary. No Welcome state exists. Theme has two sets of navy tokens but no elevated/input surface tokens; dialogs share card backgrounds and inputs use translucent card backgrounds. Some sidebar accents bypass tokens. Existing i18next updates live; priority pages contain some hardcoded English and Thai copy includes literal phrases such as model candidates rendered as ผู้สมัคร.

Selected revision: default entry Welcome with finite UX-only snoozes; six-part tutorial preserving five resource steps plus explicit mental-model acknowledgement; compact Dashboard guide; explicit named single-Tree continuation/multiple-Tree picker; shared background/surface/elevated/input tokens; natural EN/TH tutorial/Welcome and priority copy. No Core/runtime/auth engine changes or migration.
