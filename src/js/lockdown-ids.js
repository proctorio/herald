// Proctorio lockdown extension builds that may message Herald (the lockdown
// channel, decision D8), as SHA-256 hashes of their extension IDs. Most of
// these builds are not public, so no lockdown extension ID appears anywhere in
// this repository: manifest.json admits every extension (externally_connectable
// ids "*", no matches) and external-messaging.js answers only a sender whose ID
// hashes to an entry here. Every Herald channel, dev and prod, carries this same
// list. To add a build, hash its ID (printf %s <id> | shasum -a 256) and name the
// build, never the ID, in the comment. The build gate
// (tools/audit-lockdown-ids.js) fails if a listed ID ever appears in plain text.
// Hashes of the IDs the lockdown extension team published, 2026-09-27.
export const LOCKDOWN_ID_HASHES = Object.freeze([
	"dda1368b5de6ec03f05646d6434e717d9c290e96f17c0877e079829a4f07b780", // Stable, Chrome MV3
	"f7dd01d986d24243c67e30aa815f993ec32766ff596dd8dd93077bd21ade4e8f", // Stable, Chrome
	"6becc98bda268abb06ae9cc9eaabf549178f201d0aa1fb57089dc336cb2d3c44", // Stable, Edge MV3
	"ca4764b7765c22d62fe990c287f78c796289bc6a916f361b22176ce433c014e7", // Stable, Edge
	"dc938a3a374ad7a076f39ca7bd30cdebd6e566794a1293af282a5593aa1a184b", // Beta, Chrome MV3
	"28084d508245ecf217b84cdd4a8dd5a13af0eac5312ff8700363182fcb257874", // Beta, Chrome
	"c1b54b43080e1531c04dab4b86ca7092981fd0bc0f4ec727d154ef455d22cef1", // Beta, Edge MV3
	"3ca8f9bff7baf7cf0fa496c0634085a3ffcf88adaaf53bf254fdfe7cd235842f", // Beta, Edge
	"bf8f96c5bfffd6da9e65d66c1203d12f304cbd37489f67f27179c7423b240313", // Dev (the lockdown team's harness build)
	"56035454e72413cf5542d06eb4241e5d1bfdc26a1f1143d693f1fa153664af43", // Staging
	"85cc0f8c6faa564f8f2db627e21cce6b41cf9faff45351eba8a56081de84df99", // Canary
	"31bd3d5e3a19f31edc07a57c2f7b3dcc3b946daa6f64ffd372906b29597d1124", // Partners
	"a6f6c4f976190c80d79e247c45c77af05130af8d292427c3148aec1d856995bb" // Automation
]);
