const fs = require('fs');
const file = 'app/campus-map.tsx';
let code = fs.readFileSync(file, 'utf8');

// Replace filterBar, filterBarContent, filterPill, filterPillText
code = code.replace(/filterBar: { maxHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },/g, `filterBar: { borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 52 },`);

code = code.replace(/filterPill: {[\s\S]*?maxWidth: 180,\n  },/g, `filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
  },`);

code = code.replace(/filterPillText: { fontSize: 13, fontWeight: '600' },/g, `filterPillText: { fontSize: 13, fontWeight: '600' },`);

fs.writeFileSync(file, code);
