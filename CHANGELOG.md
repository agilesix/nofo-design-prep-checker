# Changelog

## [1.8.0](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.7.0...v1.8.0) (2026-04-30)


### Features

* add HEAD-005 to flag headings that may be misformatted normal text ([f5c9e58](https://github.com/agilesix/nofo-design-prep-checker/commit/f5c9e58d86da9bedf8d8ee834d23f860fb767702))
* HEAD-005 — flag headings that may be misformatted normal text ([5a2fd81](https://github.com/agilesix/nofo-design-prep-checker/commit/5a2fd81e5225ad50c75825c2e7c704ac5eb22c23))


### Bug Fixes

* **LINK-003:** extend to all story parts; document split-run limitation ([1b035b2](https://github.com/agilesix/nofo-design-prep-checker/commit/1b035b2a9809d90bd52b082dfe40fb316d04d3b1))
* **LINK-003:** reimplement as Grants.gov capitalization auto-fix ([2a283df](https://github.com/agilesix/nofo-design-prep-checker/commit/2a283df5b0baa9813252851a13f6a1b9f0ca8658))
* **LIST-001:** improve bullet detection suggested fix and description ([658c143](https://github.com/agilesix/nofo-design-prep-checker/commit/658c143deea7f0669a6dc514e8208b6773ab4c78))
* **TABLE-004:** update test assertions to match callout box label change ([8338446](https://github.com/agilesix/nofo-design-prep-checker/commit/8338446ae8d724866f4e7217efacdd1b4b14fa1b))
* **TABLE-004:** use "callout box" instead of "table" in summary label ([a5541a4](https://github.com/agilesix/nofo-design-prep-checker/commit/a5541a4ef1599eec7f84a1a8e29c9155e08ce62f))

## [1.7.0](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.6.1...v1.7.0) (2026-04-27)


### Features

* add mobile site alert on upload page; remove iOS-specific download code ([db33d87](https://github.com/agilesix/nofo-design-prep-checker/commit/db33d87350fd09bdb70e2f298880d043969d5b89))
* **CLEAN-017:** populate nearestHeading/location on Issues; add buildDocx tests ([6706cb9](https://github.com/agilesix/nofo-design-prep-checker/commit/6706cb9b075ab1499aefdc863f0bc246635eefd6))
* **rules:** add CLEAN-017 Grants.gov link text and URL normalization ([19bd293](https://github.com/agilesix/nofo-design-prep-checker/commit/19bd2933488e88381b9bcfb98c6c9df55261bc5b))
* **rules:** add CLEAN-017 Grants.gov link text and URL normalization ([a2d6f70](https://github.com/agilesix/nofo-design-prep-checker/commit/a2d6f70974eb6c755a73daa737f2fedfb3bbc8ca))
* **rules:** add CLEAN-018 universal instruction box table removal ([662f966](https://github.com/agilesix/nofo-design-prep-checker/commit/662f966f98bd3efee3ca6996ff4ce6c86bdec313))
* **rules:** add CLEAN-018 universal instruction box table removal ([f60435a](https://github.com/agilesix/nofo-design-prep-checker/commit/f60435ad8a17feb0c6d37459964a315e08f5d650))


### Bug Fixes

* add getAttributeNS fallback to heading-level readers ([abba4e4](https://github.com/agilesix/nofo-design-prep-checker/commit/abba4e43afca876d21095a18e7bc362412450ea5))
* add usa-site-alert--emergency to render icon and brown styling ([169b83a](https://github.com/agilesix/nofo-design-prep-checker/commit/169b83a5fc5b86e37fac0ffd66a0fc1f555eb68a))
* **buildDocx:** clamp getHeadingLevel to 1–6 ([a66bd76](https://github.com/agilesix/nofo-design-prep-checker/commit/a66bd76038c664b7ad072f23472ea0c240342b31))
* **CLEAN-007:** require scaffolding table; guard NOFO metadata block ([6cbc3ca](https://github.com/agilesix/nofo-design-prep-checker/commit/6cbc3ca1497439a5e949a64f3f533e165cba33bb))
* **CLEAN-007:** require scaffolding table; guard NOFO metadata block ([bc872e7](https://github.com/agilesix/nofo-design-prep-checker/commit/bc872e733228d592bd5a5d32d919ba1556612e42))
* **CLEAN-007:** require scaffolding table; guard NOFO metadata block ([ac54210](https://github.com/agilesix/nofo-design-prep-checker/commit/ac54210551f97c676b64c3d8c7a77066b40cb530))
* **CLEAN-007:** require scaffolding table; guard NOFO metadata block ([351a930](https://github.com/agilesix/nofo-design-prep-checker/commit/351a930539cf7d1e296ccf90409a2385227bd101))
* **CLEAN-018:** exclude BCD6F4 tables and add nested-table regression test ([b3bc7ed](https://github.com/agilesix/nofo-design-prep-checker/commit/b3bc7edbb02d7dbf19a5b47e339068dc4af83887))
* **HEAD-003:** clamp Heading7-9, fix JSDoc, assert OOXML index ([5c6ea39](https://github.com/agilesix/nofo-design-prep-checker/commit/5c6ea39dfd3320e899d07c8055789baea60540a6))
* **HEAD-003:** include headings inside w:sdt content controls ([f32d0c0](https://github.com/agilesix/nofo-design-prep-checker/commit/f32d0c04093276c68aefef354921dc90be300bef))
* **HEAD-003:** include headings inside w:sdt content controls ([1e4f95b](https://github.com/agilesix/nofo-design-prep-checker/commit/1e4f95ba524749ceb9895ab3c845d8ecbd4d0722))
* **LINK-007:** skip [PDF] label for size-annotated and positional variants ([d1b6a63](https://github.com/agilesix/nofo-design-prep-checker/commit/d1b6a639cd8beee595dd1a52793f207e89f5abfe))
* resolve merge conflicts in CLEAN-007 accepting NBSP normalization from head-003-incorrect ([27c5a6e](https://github.com/agilesix/nofo-design-prep-checker/commit/27c5a6e680dc039b6a8de63ba0912c95b4b78366))
* **rules:** add CDC and CDC-funded heading capitalization exceptions to HEAD-001 ([65bdf86](https://github.com/agilesix/nofo-design-prep-checker/commit/65bdf867f2e151e7ca4942d8a73b8775ccb5ca6d))
* **rules:** add CDC and CDC-funded heading capitalization exceptions to HEAD-001 ([9f468fc](https://github.com/agilesix/nofo-design-prep-checker/commit/9f468fc0cf936efd43c2bec87e744626f8e19248))
* **rules:** extend CLEAN-011 to insert missing glyphs and cover Step 3 checklist tables ([c3f36e6](https://github.com/agilesix/nofo-design-prep-checker/commit/c3f36e6e10ab0582ba6ed154c4db84a892117037))
* **rules:** extend CLEAN-011 to insert missing glyphs and cover Step 3 checklist tables ([a9003eb](https://github.com/agilesix/nofo-design-prep-checker/commit/a9003eb9ed1704a830eeb9e7dc3f12ba5b8cdb59))
* **rules:** skip PDF link text append when [PDF] already present in link text ([b4f7384](https://github.com/agilesix/nofo-design-prep-checker/commit/b4f73848eaaf0d99a2e78b8e3b13c8a8033bb2b2))
* **rules:** skip PDF link text append when [PDF] already present in link text ([599acd9](https://github.com/agilesix/nofo-design-prep-checker/commit/599acd92ac1fd395237184d044ed977b389da738))
* use default (emergency) style for mobile site alert on upload page ([5fa2acf](https://github.com/agilesix/nofo-design-prep-checker/commit/5fa2acf5502f528d0ef3c76f3407f50a37ac067b))

## [1.6.1](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.6.0...v1.6.1) (2026-04-23)


### Bug Fixes

* address review feedback on iOS download and IMG-001 preamble exemption ([0afc07e](https://github.com/agilesix/nofo-design-prep-checker/commit/0afc07e604dc5c8fae949372585f5cfe6e8b47cc))
* **buildDocx:** restore XML declaration stripped by XMLSerializer ([7c4d0a2](https://github.com/agilesix/nofo-design-prep-checker/commit/7c4d0a2ad7bdfc39f72d2880deea7cd2c501ddef))
* **IMG-001:** add non-null assertions to satisfy strict TS array indexing ([9f01d4f](https://github.com/agilesix/nofo-design-prep-checker/commit/9f01d4f2e7b6f7e8507fd32f34d31272b9a3e6c4))
* **IMG-001:** exempt CDC/DGHT preamble images from alt text check ([080ecd9](https://github.com/agilesix/nofo-design-prep-checker/commit/080ecd980fcae2491cbe44a7acecfb5adf7ed41a))
* implement iOS-specific download handling for .docx files ([fd5f5ff](https://github.com/agilesix/nofo-design-prep-checker/commit/fd5f5ff8182f99ec8d1fd9521c8ba33f92f89605))
* **ios:** add pre-download banner with save instructions and loading state ([5476ecd](https://github.com/agilesix/nofo-design-prep-checker/commit/5476ecd1f64f8ab0ee7e25671365d90b55b3ff49))
* **ios:** close pre-opened tab if buildDocx throws ([48a7632](https://github.com/agilesix/nofo-design-prep-checker/commit/48a7632e661115ce16507dd1c3b9c634b48c377c))
* **ios:** gate &lt;a download&gt; data URI path to Safari 13.4+ ([586226b](https://github.com/agilesix/nofo-design-prep-checker/commit/586226bd396944f0829f636932e9fe948683301d))
* **ios:** guard iosWindow navigation against user-closed window ([32cf9d1](https://github.com/agilesix/nofo-design-prep-checker/commit/32cf9d15416e9a2257373f0f28d98b81806bcef5))
* **ios:** open blob URL in pre-opened tab with inline save instructions ([566e671](https://github.com/agilesix/nofo-design-prep-checker/commit/566e671875d03309c506137acd4019e700c3ac44))
* **ios:** open blob URL in pre-opened tab with inline save instructions ([538d0f4](https://github.com/agilesix/nofo-design-prep-checker/commit/538d0f436ae4897ecdb6babfc8f9365dbf47cc19))
* **ios:** remove Web Share API — use data URI directly on iOS ([b4d3e69](https://github.com/agilesix/nofo-design-prep-checker/commit/b4d3e69b4475f3efcda5365b11f99a0a0ded366e))
* **ios:** remove Web Share API — use data URI directly on iOS ([adba383](https://github.com/agilesix/nofo-design-prep-checker/commit/adba3838f5ac5f1fa9e4af73ad8568ce708e0526))
* **ios:** replace download button with use-desktop message on iOS ([ece4a08](https://github.com/agilesix/nofo-design-prep-checker/commit/ece4a08823729dd8cf0234415cc6aa61f48ce764))
* **ios:** replace download with use-desktop message + XML declaration fix ([12d21fc](https://github.com/agilesix/nofo-design-prep-checker/commit/12d21fcc6c2a3c4fd6da70dda1c33fbc66f9e87b))
* **ios:** switch from data URI to blob URL to fix corrupted downloads ([e4bcd88](https://github.com/agilesix/nofo-design-prep-checker/commit/e4bcd88262be0c5628e7f4fa0753759e042b4f0b))
* **ios:** switch from data URI to blob URL to fix corrupted downloads ([1ca0209](https://github.com/agilesix/nofo-design-prep-checker/commit/1ca02098eb3a545192237f2c1329c249575cfc65))
* **ios:** use &lt;a download&gt; with data URI to preserve filename on iOS ([df6c9af](https://github.com/agilesix/nofo-design-prep-checker/commit/df6c9afb4a55d731320d2d9d45fb8a33e6b95747))
* **ios:** use &lt;a download&gt; with data URI to preserve filename on iOS ([f75be3a](https://github.com/agilesix/nofo-design-prep-checker/commit/f75be3a3aebee0cf2e4b61f9502532fc459a468c))
* **ios:** use window.location.replace() for data URI navigation ([93ef72f](https://github.com/agilesix/nofo-design-prep-checker/commit/93ef72f754eae64b73d2769df3c8cf193bf00ea8))
* **ios:** wrap blob in File to preserve downloadName on iOS share sheet ([8784529](https://github.com/agilesix/nofo-design-prep-checker/commit/87845298954b09d8b87475477aa8767ce6a7cd9d))
* **lint:** replace (window as any) with typed cast in iOS detection ([182ca27](https://github.com/agilesix/nofo-design-prep-checker/commit/182ca27ec6999c5fb6cc11e778fbb8155157612b))
* simplify iOS download to anchor-click with deferred blob revocation ([7b40399](https://github.com/agilesix/nofo-design-prep-checker/commit/7b40399d1cb34cd026be4cbdb98f39b32c504bbc))
* simplify iOS download to anchor-click with deferred blob revocation ([6520e92](https://github.com/agilesix/nofo-design-prep-checker/commit/6520e922e532b93c0395ec823e19669f477bbc45))

## [1.6.0](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.5.2...v1.6.0) (2026-04-22)


### Features

* **CLEAN-007:** remove DGHT/DGHP instruction box tables from output docx ([3c255d4](https://github.com/agilesix/nofo-design-prep-checker/commit/3c255d4045b36f8f93d4a28b6708144a31722fb5))
* **upload:** add pre-upload checklist below file upload component ([b639870](https://github.com/agilesix/nofo-design-prep-checker/commit/b63987095a182d4d2923939c621818edef034f9b))
* **upload:** add pre-upload checklist below file upload component ([966b25a](https://github.com/agilesix/nofo-design-prep-checker/commit/966b25a3f9e7e492ed897319dd83a8b2f4bf1d70))


### Bug Fixes

* **CLEAN-007:** use 'as unknown as' for AutoAppliedChange casts in tests ([ffad07f](https://github.com/agilesix/nofo-design-prep-checker/commit/ffad07fc6ae3ac74711b2b0bd515a57d1c7726f5))
* **CLEAN-007:** use 'as unknown as' for AutoAppliedChange casts in tests ([aeb5c6d](https://github.com/agilesix/nofo-design-prep-checker/commit/aeb5c6d22901fb0c73bc5a6070dbbc81c38fd39c))
* **HEAD-004:** remove text guard that blocked heading text corrections ([7d3ac1c](https://github.com/agilesix/nofo-design-prep-checker/commit/7d3ac1caf37ee45ade985bb0053804365c5561ae))
* **LINK-009:** align buildDocx patch to alphanumeric boundary rule ([27e9cae](https://github.com/agilesix/nofo-design-prep-checker/commit/27e9cae271d0d6365a0fa6d95901a9e035e08856))
* **LINK-009:** exclude punctuation from partial hyperlink detection ([0110e23](https://github.com/agilesix/nofo-design-prep-checker/commit/0110e23590c38a2094f4179dbcaf383e481249c7))
* **LINK-009:** exclude punctuation from partial hyperlink detection ([00b2ce0](https://github.com/agilesix/nofo-design-prep-checker/commit/00b2ce0c32510c6617a848a557f114b2f00f0a7d))
* **TABLE-002,TABLE-003:** exempt CDC scaffolding table from flagging ([9854b72](https://github.com/agilesix/nofo-design-prep-checker/commit/9854b7221ad4bfe836ae78967b717ef8c7893337))
* **TABLE-002,TABLE-003:** exempt CDC scaffolding table from flagging ([0ad4a95](https://github.com/agilesix/nofo-design-prep-checker/commit/0ad4a959a42e72652c30aaa4466827c45c05acf7))
* **TABLE-002,TABLE-003:** trim firstCellText before CDC exemption regex ([a5404fe](https://github.com/agilesix/nofo-design-prep-checker/commit/a5404fe798197760bf700b89c039070846a4daee))

## [1.5.2](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.5.1...v1.5.2) (2026-04-22)


### Bug Fixes

* address Copilot review comments on PR [#220](https://github.com/agilesix/nofo-design-prep-checker/pull/220) ([5a57a7e](https://github.com/agilesix/nofo-design-prep-checker/commit/5a57a7e6815548858b9baf34dc4663c28a547167))
* append anchor to DOM and delay URL revocation for iOS download ([9de8224](https://github.com/agilesix/nofo-design-prep-checker/commit/9de822498f802352d4617d5ef8108214b32bdbed))
* copy binary ZIP entries as uint8array to prevent file loss ([c47fc71](https://github.com/agilesix/nofo-design-prep-checker/commit/c47fc718f436939ac6df63862a2a6c05503ea469))
* gate 30s blob URL revocation delay to iOS only ([324a093](https://github.com/agilesix/nofo-design-prep-checker/commit/324a0933c0176b153b8655c32a94e01e53b7d443))
* remove all anchor attribute variants before setAttributeNS in link.bookmark path ([7336c5b](https://github.com/agilesix/nofo-design-prep-checker/commit/7336c5b2f7b04df22e3101a1c262ed80b858b0b3))
* use setAttributeNS for all w: attribute writes to prevent xmlns:w corruption ([8aa9dad](https://github.com/agilesix/nofo-design-prep-checker/commit/8aa9dad5ebc1960add745d804a908f3e02b4f14a))
* use setAttributeNS for all w: attribute writes to prevent xmlns:w corruption ([00fc8fe](https://github.com/agilesix/nofo-design-prep-checker/commit/00fc8fe91a523069cf7e03996dde46aefa8e6ed1))

## [1.5.1](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.5.0...v1.5.1) (2026-04-22)


### Bug Fixes

* iOS Word compatibility + skip/undo clears recorded input value ([7ab1d97](https://github.com/agilesix/nofo-design-prep-checker/commit/7ab1d97abe20d0548a0a1a329130c6b813abc63e))
* unconditionally enforce STORE for infrastructure files before generateAsync ([e62f1d4](https://github.com/agilesix/nofo-design-prep-checker/commit/e62f1d407400e3cdd17a77d3af6665791b3ccadc))
* use DEFLATE for XML parts and STORE for ZIP infrastructure files ([e6deeb9](https://github.com/agilesix/nofo-design-prep-checker/commit/e6deeb935ef4ecfaa59e3a04f525708253b01e37))

## [1.5.0](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.4.1...v1.5.0) (2026-04-21)


### Features

* **rules:** add CLEAN-016 auto-fix for bold trailing periods ([960666d](https://github.com/agilesix/nofo-design-prep-checker/commit/960666d2528b1e5b2dcfe1c4ae185281fa87ad2e))
* **rules:** add CLEAN-016 auto-fix for bold trailing periods ([c33f250](https://github.com/agilesix/nofo-design-prep-checker/commit/c33f25084ecdc2d78101e0f976117850c91c9421))
* **rules:** add LINK-009 auto-fix for partial hyperlinks ([c83fc5f](https://github.com/agilesix/nofo-design-prep-checker/commit/c83fc5fd3b0693e94464c79a7252acc8079babed))
* **rules:** add LINK-009 auto-fix for partial hyperlinks ([0ba9c4b](https://github.com/agilesix/nofo-design-prep-checker/commit/0ba9c4b9e87db1dbbc4c58ae0ee39cadc607ce75))
* **TABLE-004:** auto-apply heading style to "Important: public information" callout tables ([f83bf30](https://github.com/agilesix/nofo-design-prep-checker/commit/f83bf308d635460f92c64bdacc0d83704e34be44))
* **TABLE-004:** auto-apply heading style to Important: public info ([0a439be](https://github.com/agilesix/nofo-design-prep-checker/commit/0a439be68dac7166f15893187fc5d6b0dbbb15f8))


### Bug Fixes

* **buildDocx:** handle emails embedded in longer runs for LINK-008 mailto fix ([e2e0013](https://github.com/agilesix/nofo-design-prep-checker/commit/e2e001330741a942a70830942a7e1504723e5850))
* **buildDocx:** handle emails embedded in longer runs for mailto fix ([30888b9](https://github.com/agilesix/nofo-design-prep-checker/commit/30888b9a539672bdf993fb448e31298a07c81553))
* **TABLE-004:** preserve heading style format, fix cell/sdt scoping ([998dbe8](https://github.com/agilesix/nofo-design-prep-checker/commit/998dbe86365c87aedb698c36ccef266ace809861))

## [1.4.1](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.4.0...v1.4.1) (2026-04-21)


### Bug Fixes

* clear input value and gate display on accepted when user skips a text input issue ([3181c47](https://github.com/agilesix/nofo-design-prep-checker/commit/3181c47e49c9ff86dfa4ae55686ef29170e194a1))

## [1.4.0](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.3.0...v1.4.0) (2026-04-20)


### Features

* **CLEAN-007:** extend preamble removal to all CDC content guides ([5a1e8f9](https://github.com/agilesix/nofo-design-prep-checker/commit/5a1e8f9d9aa305f28b98984fa62b8a188c9540fe))
* **CLEAN-007:** extend preamble removal to all CDC content guides ([6422158](https://github.com/agilesix/nofo-design-prep-checker/commit/64221585414dc68078c7a0474b435d8d4fd84d49))


### Bug Fixes

* **App:** clear acceptedFixes when starting a new review run ([a4d1b7a](https://github.com/agilesix/nofo-design-prep-checker/commit/a4d1b7a90beac3f1d0f6efd24d1b17867c5ec0ac))
* **App:** persist accepted fix values across review page navigation ([25305af](https://github.com/agilesix/nofo-design-prep-checker/commit/25305af8297bd15509ba5f7f8a5df934b7a1427e))
* **App:** persist accepted fix values across review page navigation ([59f7cb3](https://github.com/agilesix/nofo-design-prep-checker/commit/59f7cb3e596f709ee5d92caa245bb55362141949))
* **buildDocx:** apply HEAD-004 text fix even when HEAD-003 changed ([5f4c443](https://github.com/agilesix/nofo-design-prep-checker/commit/5f4c4432883c962fccab659d2773eda39a0237fd))
* **buildDocx:** apply HEAD-004 text fix even when HEAD-003 changed the level first ([166639b](https://github.com/agilesix/nofo-design-prep-checker/commit/166639bb1e6d0cb6f15726f3d9ed7ca8531b6e49))

## [1.3.0](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.2.0...v1.3.0) (2026-04-20)


### Features

* add CDC DGHP competitive content guide ([24ceaf7](https://github.com/agilesix/nofo-design-prep-checker/commit/24ceaf796ed0167fe6c0996f56aea3358851652f)), ([71e5bc2](https://github.com/agilesix/nofo-design-prep-checker/commit/71e5bc23cb15af6b9a090a2a46c20b45a285dcea))
* **clean-014:** strip wrapping quotes from tagline value ([3e301c0](https://github.com/agilesix/nofo-design-prep-checker/commit/3e301c035eb378b28086c53582b559f8eed031ce)), ([93e6ecc](https://github.com/agilesix/nofo-design-prep-checker/commit/93e6eccb388445b6eefba1ad487f86478a563600))
* **detect:** expand CDC DGHP detection signals to 8 ([2892899](https://github.com/agilesix/nofo-design-prep-checker/commit/2892899e5b772415ebe06b56154fb87d664eb695)), ([1b6bf57](https://github.com/agilesix/nofo-design-prep-checker/commit/1b6bf57a3d46eae5a11596e2e4b4c00821f6ec5e))
* **detectPreNofo:** add CDC/DGHT SSJ pre-NOFO detection signals ([6f3940e](https://github.com/agilesix/nofo-design-prep-checker/commit/6f3940eeecf439389a3dfa93f2e7be49889ed6e7)), ([ed884e2](https://github.com/agilesix/nofo-design-prep-checker/commit/ed884e26b1d30f9382c0138e5d643ebc0cb9a53d))
* **download:** reorder page content and apply brand button colors ([1143e0d](https://github.com/agilesix/nofo-design-prep-checker/commit/1143e0d8f8b7ca91b87b128a52b5f289e856112d)), ([9065b6c](https://github.com/agilesix/nofo-design-prep-checker/commit/9065b6c7596fea4e4dfac20119ee4a5f313367ad))
* **guide-selection:** add CDC NOFO ID helper text below dropdown ([17258ff](https://github.com/agilesix/nofo-design-prep-checker/commit/17258ff9ee8bb9574d2b2c86b10186a4a7d7a18b)), ([94cbdba](https://github.com/agilesix/nofo-design-prep-checker/commit/94cbdbac9f7f0f61ac497b46f6be88a82c2bb9ce))
* **head-004:** flag headings that may be too long ([144edcf](https://github.com/agilesix/nofo-design-prep-checker/commit/144edcfce5cee71522cd244eefb1ff44692d5bb9)), ([10312fc](https://github.com/agilesix/nofo-design-prep-checker/commit/10312fcb298cf8f23c75914996650c9e047642f3))
* **rules:** add CLEAN-015 to remove bold from list bullet characters ([8aeadc7](https://github.com/agilesix/nofo-design-prep-checker/commit/8aeadc798cdd13f9c073a578dda56e3b3e27ce69)), ([6b6eaa0](https://github.com/agilesix/nofo-design-prep-checker/commit/6b6eaa02bf9f1193d40aa8c7d3a110abb34d76d3))


### Bug Fixes

* **detectContentGuide:** broaden RFA-JG- signal and add debug logging for DGHP detection ([e3e8a40](https://github.com/agilesix/nofo-design-prep-checker/commit/e3e8a40f19b279398dd5086031c5247bf96f5af6), [5c40b7c](https://github.com/agilesix/nofo-design-prep-checker/commit/5c40b7c930487065377686e07006c9a02b71d629))
* **detectContentGuide:** gate DGHP fast-path on hasCdcIdentifier ([1269c67](https://github.com/agilesix/nofo-design-prep-checker/commit/1269c673d3814b0261a348d2a0758129fbc91418))
* **detectContentGuide:** resolve merge conflicts in DGHP detection ([ba13956](https://github.com/agilesix/nofo-design-prep-checker/commit/ba139565b4f309536d0b09472ea58fe39b3dd1a0))
* **download:** update bold text reminder copy ([97230ca](https://github.com/agilesix/nofo-design-prep-checker/commit/97230ca1fd5fe07c4b817dd7141aedd6951bbd5b), [4925e11](https://github.com/agilesix/nofo-design-prep-checker/commit/4925e11f3ce0f5f355f1bd17c6b6d3c05d229115))
* **guide-selection:** associate CDC hint with select via aria-describedby ([52b732c](https://github.com/agilesix/nofo-design-prep-checker/commit/52b732c7b4760c3dae1bd305118f1f49c7b6b304))
* **head-004:** tailor description to the threshold(s) exceeded ([d7ee794](https://github.com/agilesix/nofo-design-prep-checker/commit/d7ee794b3ba6bc177625a24181e74f3e62d71f71))
* **ReviewStep:** persist accepted text input values across back-navigation ([34e59d0](https://github.com/agilesix/nofo-design-prep-checker/commit/34e59d0a60917748455c3100eaa3bd36f0294ed9), [6bdaba4](https://github.com/agilesix/nofo-design-prep-checker/commit/6bdaba440a440549b4176b8dc5dc60580daaf9d0))
* **tests:** update CLEAN-007 and RuleRunner tests for cdc-dghp guide ([a144b0b](https://github.com/agilesix/nofo-design-prep-checker/commit/a144b0b11487ab659d973381a572abd897e952df), [8321a84](https://github.com/agilesix/nofo-design-prep-checker/commit/8321a84b7bf7533f94a05cd24c619f15f8da9fb2))

## [1.2.0](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.1.0...v1.2.0) (2026-04-16)


### Features

* add labeled component reference exceptions to HEAD-001 and TABLE-002 ([c6f95a8](https://github.com/agilesix/nofo-design-prep-checker/commit/c6f95a8e232ec34bb0433b999b46786870ad29da))
* add labeled component reference exceptions to HEAD-001 and TABLE-002 ([43523dd](https://github.com/agilesix/nofo-design-prep-checker/commit/43523dd47104e08c3836091a99472a8b7b8bdaae))
* exempt structured designator patterns from cap checks ([7d90465](https://github.com/agilesix/nofo-design-prep-checker/commit/7d90465d1e20d5fe90c4823bbb5335091d73d788))
* exempt structured designator patterns from cap checks ([8150aca](https://github.com/agilesix/nofo-design-prep-checker/commit/8150aca02dc41a813fb94c66c38024b4c6c1b476))
* **LINK-006:** auto-fix anchors missing word-separator underscores ([92ea9ef](https://github.com/agilesix/nofo-design-prep-checker/commit/92ea9efbc1fd71f463d7dc5cdc135140fc5ac9e4))
* **LINK-006:** auto-fix OOXML bookmark anchor mismatches silently ([b96311d](https://github.com/agilesix/nofo-design-prep-checker/commit/b96311d6a5eea1d049e381065784911ee41c3798))
* **LINK-006:** auto-fix OOXML bookmark anchor mismatches silently ([b53792e](https://github.com/agilesix/nofo-design-prep-checker/commit/b53792e6722f0728747dc168f1c4eba69ea5926a))
* **LINK-006:** reinstate accept-to-fix for OOXML bookmark matches ([9e7c7da](https://github.com/agilesix/nofo-design-prep-checker/commit/9e7c7da64e0cbeffab7681b498f5e8b698d36934))
* **LINK-006:** reinstate accept-to-fix for OOXML bookmark matches ([35cf890](https://github.com/agilesix/nofo-design-prep-checker/commit/35cf890d74423a53e6c7df3eba25455feef48f96))
* **LINK-006:** replace anchor auto-fix with instruction-only warnings ([be16c5c](https://github.com/agilesix/nofo-design-prep-checker/commit/be16c5c99781159ecbf9b528a567ddb49efec67c))
* **LINK-006:** replace anchor auto-fix with instruction-only warnings ([b426150](https://github.com/agilesix/nofo-design-prep-checker/commit/b426150e57884de9693abbd969395b3c5291f95c))
* **review:** add bold category prefix to auto-applied changes list ([225a847](https://github.com/agilesix/nofo-design-prep-checker/commit/225a847b51c6113b1d1eb536cd889d90376b038e))
* **review:** add bold category prefix to auto-applied changes list ([5e3b963](https://github.com/agilesix/nofo-design-prep-checker/commit/5e3b963cfea9e63e3fccfa8e1b91212167d3fb1e))
* **rules:** add HEAD-002 (multiple H1s) and HEAD-003 (skipped heading levels) ([2a01880](https://github.com/agilesix/nofo-design-prep-checker/commit/2a01880d5f294bb0d0528165a2c115c43e162766))
* **rules:** add HEAD-002 (multiple H1s) and HEAD-003 (skipped heading levels) ([ed0ad2d](https://github.com/agilesix/nofo-design-prep-checker/commit/ed0ad2d8956b82c31718d356d07982add9ab552b))


### Bug Fixes

* additional HEAD-001 and TABLE-002 updates ([18463b5](https://github.com/agilesix/nofo-design-prep-checker/commit/18463b595d5acaa0d34ca138a673e45e19fcb01b))
* additional HEAD-001 and TABLE-002 updates ([128ebef](https://github.com/agilesix/nofo-design-prep-checker/commit/128ebef7cd786b2f7bdfb2ea7bfa3e6104deff3b))
* additional HEAD-001 and TABLE-002 updates ([687309a](https://github.com/agilesix/nofo-design-prep-checker/commit/687309add64f9384b59b790978ed234436645b5b))
* **buildDocx:** address Copilot review feedback on CLEAN-008 logging and NS lookups ([221d4a0](https://github.com/agilesix/nofo-design-prep-checker/commit/221d4a008a9bb8852b8079240b7c56029c0f7391))
* **buildDocx:** correct bookmark cleanup order and harden DIAG-4 assertion ([15d00ba](https://github.com/agilesix/nofo-design-prep-checker/commit/15d00baccd4c0c6255bc32e8cec689cd963e6eae))
* **buildDocx:** strip redundant xmlns:w from serialized hyperlinks ([24d2365](https://github.com/agilesix/nofo-design-prep-checker/commit/24d2365704a913b88d493af6c15bb5e789355a96))
* **buildDocx:** strip redundant xmlns:w from serialized hyperlinks ([0583cb5](https://github.com/agilesix/nofo-design-prep-checker/commit/0583cb55b8287bc2d26900fbee42cbf817f3496b))
* **buildDocx:** use setAttribute for anchor writes; drop xmlns strip ([50b320c](https://github.com/agilesix/nofo-design-prep-checker/commit/50b320c2aa686e593a64d463fc407f13c9be68a5))
* **clean-008:** harden CLEAN-008 hyperlink/bookmark anchor update against browser DOM differences ([3c47ed5](https://github.com/agilesix/nofo-design-prep-checker/commit/3c47ed5d1f4284551fc6f27c7686d3d8bc53fb50))
* download step and buildDocx updates ([0d2848c](https://github.com/agilesix/nofo-design-prep-checker/commit/0d2848c3d378cd4df68afa2daac715df24cf4c34))
* download step and buildDocx updates ([ddf5fdb](https://github.com/agilesix/nofo-design-prep-checker/commit/ddf5fdb8be5901bb1eac4842d5d24e17aea9e721))
* **HEAD-003:** disambiguate targetField by heading ordinal index ([28014ef](https://github.com/agilesix/nofo-design-prep-checker/commit/28014efba3db536365e3ef35027970b3f727dff1))
* **HEAD-003:** disambiguate targetField by heading ordinal index ([80faecd](https://github.com/agilesix/nofo-design-prep-checker/commit/80faecdae456fce8dcd5a41b1082097a1f365413))
* merge origin/main into branch ([ed6bd04](https://github.com/agilesix/nofo-design-prep-checker/commit/ed6bd04beafb645b0699cfee527c931974164e95))
* remove unused warning constants from LINK-006 ([01d0e90](https://github.com/agilesix/nofo-design-prep-checker/commit/01d0e90f458d7f2b47dc22f5d25ed0e196bb024d))
* resolve merge conflicts ([b32b840](https://github.com/agilesix/nofo-design-prep-checker/commit/b32b840dc0ff4ce2e1b1551a469ca1254dd83259))
* **test:** remove process.env — not available without @types/node ([eccddb8](https://github.com/agilesix/nofo-design-prep-checker/commit/eccddb847422a03fdc4ca536b433d4f3f69f7d93))
* **test:** remove process.env usage from buildDocx-clean008-diag.test.ts ([87bf9ef](https://github.com/agilesix/nofo-design-prep-checker/commit/87bf9ef3420c935f04bd72d1bbed603f5b8c2c24))

## [1.1.0](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.0.4...v1.1.0) (2026-04-15)


### Features

* **buildDocx:** update internal link anchors when CLEAN-008 removes … ([929900a](https://github.com/agilesix/nofo-design-prep-checker/commit/929900a65c750497c08f02c672156e528a6b9134))
* **buildDocx:** update internal link anchors when CLEAN-008 removes heading leading spaces ([9ad7df9](https://github.com/agilesix/nofo-design-prep-checker/commit/9ad7df9c256c62e410781054a4afec46b99d2eb5))
* suppress duplicate sentence case suggestion when Form rule fires ([fe3952e](https://github.com/agilesix/nofo-design-prep-checker/commit/fe3952e15769df420da04cdc4cec68b81d3984b2))
* suppress duplicate sentence case suggestion when Form rule fires ([ccc064b](https://github.com/agilesix/nofo-design-prep-checker/commit/ccc064b4a6be2683db7440d1cb426a692eeababa))


### Bug Fixes

* adding pronoun exceptions for headings and table captions ([d69c0ab](https://github.com/agilesix/nofo-design-prep-checker/commit/d69c0ab22bdd37070535c2ac9a14b5e00bf9ece7))
* adding pronoun exceptions for headings and table captions ([7812fbd](https://github.com/agilesix/nofo-design-prep-checker/commit/7812fbdf5947a1e504fe636eda53e896b3bf808e))
* **buildDocx:** remove stale unprefixed anchor/name attrs after namespace-fallback update ([8a96776](https://github.com/agilesix/nofo-design-prep-checker/commit/8a96776d424c28fb7d09792dcd0712fc0b5139ba), [a5e716d](https://github.com/agilesix/nofo-design-prep-checker/commit/a5e716de26dcc8c7e44e8de0fc695846f2fb8d65))
* **buildDocx:** update bookmarks and defend against namespace stripping in CLEAN-008 anchor sync ([eb1c731](https://github.com/agilesix/nofo-design-prep-checker/commit/eb1c731fcd91a7d4b6b1f9ab503e922aa9e7ba1f), [33d0cbb](https://github.com/agilesix/nofo-design-prep-checker/commit/33d0cbbe83d24cfabb371b044aedb9a12f10485b))
* content control clean up in header and footer ([594b780](https://github.com/agilesix/nofo-design-prep-checker/commit/594b7800e6f878f3ccbd7f042e8df3624bc332a7))
* content control clean up in header and footer ([8fce5c5](https://github.com/agilesix/nofo-design-prep-checker/commit/8fce5c523dfe8140eb09b7a3a798cacebe72bec7))
* ensure content controls removed on export ([b28ec6c](https://github.com/agilesix/nofo-design-prep-checker/commit/b28ec6c3fd077250f5e7aad3bce4f6eb35260517))
* ensure content controls removed on export ([8603856](https://github.com/agilesix/nofo-design-prep-checker/commit/8603856868f023ffde4e4bf0575d778253311e93))
* fixes for ihs list exemptions for headings ([8f444e6](https://github.com/agilesix/nofo-design-prep-checker/commit/8f444e657e717cc6e83f18aad3a6e6b325b45499))
* fixes for ihs list exemptions for headings ([4d31c1a](https://github.com/agilesix/nofo-design-prep-checker/commit/4d31c1aa46fe84b26b73a7ef387002a956db295a))
* only flag actual captions plus content controls clean up ([e28193f](https://github.com/agilesix/nofo-design-prep-checker/commit/e28193f5f3f7c27fdb872649c421faf75d6b7e72))
* only flag actual captions plus content controls clean up ([6dfeb0f](https://github.com/agilesix/nofo-design-prep-checker/commit/6dfeb0f4cb117563269344d5c9c136de65a24d30))
* remove orphan banners in the xml parts to process section comment ([19604f8](https://github.com/agilesix/nofo-design-prep-checker/commit/19604f89a0b858e3db296136416dcf62a4f5b88e))
* remove orphan banners in the xml parts to process section comment ([8fd65bb](https://github.com/agilesix/nofo-design-prep-checker/commit/8fd65bba9d5afa209793fa47585e21e537a7d708))
* replace indigenous except rule ([5bee077](https://github.com/agilesix/nofo-design-prep-checker/commit/5bee0771f1fdff25029929c94022a2326e64eac2))
* replace indigenous except rule ([b96714b](https://github.com/agilesix/nofo-design-prep-checker/commit/b96714b56ba7426324dfccc1b92bfa49309c98a9))
* update LINK-006 test assertions to match trailing period in description ([4282cb8](https://github.com/agilesix/nofo-design-prep-checker/commit/4282cb8b9e1e4b0fc6f6446be68bc6f5c3c6ecfe))

## [1.0.4](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.0.3...v1.0.4) (2026-04-15)


### Bug Fixes

* adding more info about AI use cases to about page ([f52bdc5](https://github.com/agilesix/nofo-design-prep-checker/commit/f52bdc512e770fd6bb768e01530bca514f57bc09), [9a4b6d9](https://github.com/agilesix/nofo-design-prep-checker/commit/9a4b6d90ceae621ef16d256da86c797cb4c23043))
* backward scanning for name ([6b94ba0](https://github.com/agilesix/nofo-design-prep-checker/commit/6b94ba0fd916c4ede3b9656a4a30ad488c0aa371), [50cf7d9](https://github.com/agilesix/nofo-design-prep-checker/commit/50cf7d99648b16a724235075702fa29b6710b7df))
* fix is to split the exemption check ([f30afa8](https://github.com/agilesix/nofo-design-prep-checker/commit/f30afa8cb6a9381a30f5832d5987af5427f3b592), [ff2e6f0](https://github.com/agilesix/nofo-design-prep-checker/commit/ff2e6f05731d0316f2a76561ecf88c4a9439c803))
* getting too many issues for table captions ([6ccdd33](https://github.com/agilesix/nofo-design-prep-checker/commit/6ccdd33dca0e58465696e26c416a39b2d5184241), [302fc73](https://github.com/agilesix/nofo-design-prep-checker/commit/302fc7358ec592477b1cae9974b5c74d750f39ba))
* resolve merge conflicts in TABLE-002 ([2b36f33](https://github.com/agilesix/nofo-design-prep-checker/commit/2b36f33b440d64c3cc36bd5a46dee6ab43f8b1da))
* table exceptions with finding nearest heading ([39f883d](https://github.com/agilesix/nofo-design-prep-checker/commit/39f883d3bc1a6173f7624926ed84fbf758093411), [f9386c1](https://github.com/agilesix/nofo-design-prep-checker/commit/f9386c16d28c62f7ec000d08e429c3ae6039f375))

## [1.0.3](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.0.2...v1.0.3) (2026-04-14)


### Bug Fixes

* adding exceptions for headings rules ([49b8085](https://github.com/agilesix/nofo-design-prep-checker/commit/49b80853e0c69e9bbcae8c80eccc459b22d8a3a0), [436fccc](https://github.com/agilesix/nofo-design-prep-checker/commit/436fcccda709b8381a24058ce525a2936d5bba2b))
* adding known proper nouns for headings check ([09c50f9](https://github.com/agilesix/nofo-design-prep-checker/commit/09c50f90e0441733017a58008c0c0ece1714bead), [7c70522](https://github.com/agilesix/nofo-design-prep-checker/commit/7c7052204f65270a898a31dd0230f1e8f97fdf01))
* get rid of dupe alerts for internal link cap auto apply ([b376f36](https://github.com/agilesix/nofo-design-prep-checker/commit/b376f3617f47b7bfd6a7e9a7c5eaba66c1c3ac93), [3d7868e](https://github.com/agilesix/nofo-design-prep-checker/commit/3d7868e27a8bfbf247c8aa8a424793845aeac37a))
* minor rule revisions ([cd65c59](https://github.com/agilesix/nofo-design-prep-checker/commit/cd65c599c56b6b71a3c5ad0eba3b8f3c53bad16f), [2cfd9f8](https://github.com/agilesix/nofo-design-prep-checker/commit/2cfd9f896fc2988494bab044dcae485595d0cafb))
* relax the table title rule ([df8c68d](https://github.com/agilesix/nofo-design-prep-checker/commit/df8c68dc7d3936172b94fcaa8419adb0af958413), [1e626f8](https://github.com/agilesix/nofo-design-prep-checker/commit/1e626f8dd47e03feeb4b3e968b8873e36f472be6))
* removing dupe routing of alerts ([74c0ff9](https://github.com/agilesix/nofo-design-prep-checker/commit/74c0ff930cc351804d7a1cbe5e92899c142b7504), [f1694c9](https://github.com/agilesix/nofo-design-prep-checker/commit/f1694c9659a072d0f2ad7c09eee44c98def64be5))
* resolve merge conflict in rules.md ([d5d0f2c](https://github.com/agilesix/nofo-design-prep-checker/commit/d5d0f2cbe00b018d0337e1efb62eb2b2dcdd83dc))
* strip the leading heading space again ([849053c](https://github.com/agilesix/nofo-design-prep-checker/commit/849053c5e60f1518356f037dad6216ed59ece254), [aa91718](https://github.com/agilesix/nofo-design-prep-checker/commit/aa91718b69049fd48589d37c3359c6d5a68e6375))

## [1.0.2](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.0.1...v1.0.2) (2026-04-13)


### Bug Fixes

* add null check for wT in buildDocx ([cd98eb0](https://github.com/agilesix/nofo-design-prep-checker/commit/cd98eb04942944397d9edf0c527c4d0f4ee42a97))
* don't show issues on results page if pre nofo ([48dc76d](https://github.com/agilesix/nofo-design-prep-checker/commit/48dc76de475b8871653619c7e1d40d7731c9bea4))
* don't show issues on results page if pre nofo ([20e4d1d](https://github.com/agilesix/nofo-design-prep-checker/commit/20e4d1d9c5603e4b815d5ec2db3bec308a452dc5))
* fix for headings cap rule ([8303dc7](https://github.com/agilesix/nofo-design-prep-checker/commit/8303dc786f3fdd472fe9cfa9bb374d4edb30da62))
* fix for headings cap rule ([7c6dd47](https://github.com/agilesix/nofo-design-prep-checker/commit/7c6dd470f5753f09be423e97a93c4598037e0e2e))
* fix internal link rule to auto apply capitalization ([b0946c8](https://github.com/agilesix/nofo-design-prep-checker/commit/b0946c8f0007a10d10050061ccca182b844d2df4))
* fix internal link rule to auto apply capitalization ([dcda6a7](https://github.com/agilesix/nofo-design-prep-checker/commit/dcda6a7634d9a2db829bf45ccb66ac3a4b94f1d4))
* meta keywords still too broad ([a2252af](https://github.com/agilesix/nofo-design-prep-checker/commit/a2252af5ea0e439aea6524ffd79c685cde78aedb))
* meta keywords still too broad ([cd6a793](https://github.com/agilesix/nofo-design-prep-checker/commit/cd6a793261a428d4cf9c2ab92d947d4a3a102933))
* no more false positives for cap suggestions ([c244468](https://github.com/agilesix/nofo-design-prep-checker/commit/c2444686252273558d11c806b66e5dc04534ce34))
* no more false positives for cap suggestions ([b478849](https://github.com/agilesix/nofo-design-prep-checker/commit/b478849706af31f8d576d9e12563038c28f89da9))
* null check for wT in buildDocx title case patch ([3f6b0b4](https://github.com/agilesix/nofo-design-prep-checker/commit/3f6b0b448c3726ce6041755718fc1c9ecd93490d))
* resolve merge conflicts in LINK-006 and buildDocx ([c4dc82b](https://github.com/agilesix/nofo-design-prep-checker/commit/c4dc82b025c826e5feb793d4daf915cd97a0845c))

## [1.0.1](https://github.com/agilesix/nofo-design-prep-checker/compare/v1.0.0...v1.0.1) (2026-04-13)


### Bug Fixes

* further improvements to LINK-006 anchor handling ([8204fea](https://github.com/agilesix/nofo-design-prep-checker/commit/8204fea2719f75d036ce13ec556e383b29421fde))
* further improvements to LINK-006 anchor handling ([1acb232](https://github.com/agilesix/nofo-design-prep-checker/commit/1acb232d862fa3b4bdf5e88ec8d6a9d66ff40754))
* resolve merge conflict in LINK-006 ([0beffb2](https://github.com/agilesix/nofo-design-prep-checker/commit/0beffb22b5e6290d498091c012c4d5a64cebb568))
* trim leading spaces from heading anchors in LINK-006 ([aa59599](https://github.com/agilesix/nofo-design-prep-checker/commit/aa5959924ff0cd72179ac251b48596ee70cf7297))

## 1.0.0 (2026-04-11)


### Features

* dark green header and white About page hero banner ([8091000](https://github.com/agilesix/nofo-design-prep-checker/commit/80910008bc0b2010d466e550e17369a72717dba8))
* dark green header and white About page hero banner ([928a2dc](https://github.com/agilesix/nofo-design-prep-checker/commit/928a2dcb336a6ef583d533c7402092e350b72621))


### Bug Fixes

* add type guards and null checks in META test files ([1b40011](https://github.com/agilesix/nofo-design-prep-checker/commit/1b40011ff95778070c8015be31c71e1fa00c760f))
* build error ([6dd4d74](https://github.com/agilesix/nofo-design-prep-checker/commit/6dd4d74d197fd0dfb9658f985f1bddf7c34eebeb))
* FORMAT-002 type error and unused variable ([64dfe15](https://github.com/agilesix/nofo-design-prep-checker/commit/64dfe15c19f06b72e79905883efa2729a0ce882d))
* remove double comma in keyword suggestions ([f0658d6](https://github.com/agilesix/nofo-design-prep-checker/commit/f0658d6b8a0526aa1e8c768228496d42a1902aac))
* remove double comma in keyword suggestions ([d00ec65](https://github.com/agilesix/nofo-design-prep-checker/commit/d00ec6504e4cec42084aae6b17d7e3cf0123c622))
* remove page property from LIST-001 issue object ([3a17b08](https://github.com/agilesix/nofo-design-prep-checker/commit/3a17b089ed62fa198029431809bff2f9a8c07c51))
* resolve constant condition lint error in buildDocx ([a1e174f](https://github.com/agilesix/nofo-design-prep-checker/commit/a1e174f3185a48972daa5c2dec130b8a65e54ff7))
* resolve merge conflict in buildDocx test ([03c3c15](https://github.com/agilesix/nofo-design-prep-checker/commit/03c3c1573af1f622f0fcb09ef3bd5ae8eee42b46))
* resolve merge conflicts ([b5e9eda](https://github.com/agilesix/nofo-design-prep-checker/commit/b5e9eda257a686b6fe5178e5fc2bf06ad558c29a))
* resolve merge conflicts ([c26568b](https://github.com/agilesix/nofo-design-prep-checker/commit/c26568b3959ea692beac043c7b10e08affc87ecd))
* resolve merge conflicts in SummaryReport, AboutPage, and styles ([5a60cef](https://github.com/agilesix/nofo-design-prep-checker/commit/5a60cefa8a6e12d022306764894b1877df6bf99a))
* resolve merge conflicts in SummaryReport, AboutPage, and styles ([ef43a75](https://github.com/agilesix/nofo-design-prep-checker/commit/ef43a75ccf69ef7c31360bb15ef849229224b91f))
* resolve SummaryReport merge conflict ([0114ce5](https://github.com/agilesix/nofo-design-prep-checker/commit/0114ce52bd2bde9ce7729e99d323791ef24d41da))
* unreviewed label key in SummaryReport stat cards ([219e3d0](https://github.com/agilesix/nofo-design-prep-checker/commit/219e3d06e238a50224b25fac24b6c28f6c1d235f))
* unreviewed label key in SummaryReport stat cards ([a752547](https://github.com/agilesix/nofo-design-prep-checker/commit/a7525477f4af8e1b9893f50ac9df676eaa6c7743))
* ux issues summary ([36d2bda](https://github.com/agilesix/nofo-design-prep-checker/commit/36d2bdac8ed7497694d4655a498ba1134c1375a2))

All notable changes to this project will be documented in this file.

See [Conventional Commits](https://www.conventionalcommits.org/) for commit message guidelines.
