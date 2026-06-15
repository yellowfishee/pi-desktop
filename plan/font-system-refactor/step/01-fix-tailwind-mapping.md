# Step 1: 修复 Tailwind 字号映射

## 任务
修正 tailwind.config.js 中 fontSize 的命名和变量对应关系，确保 text-xs → --font-xs, text-sm → --font-sm 等一一对应。

## 当前问题
```js
fontSize: {
  'xxs': ['var(--font-xs)',  { lineHeight: '1.25rem' }],  // text-xxs → --font-xs (12px)
  'xs':  ['var(--font-sm)',  { lineHeight: '1.25rem' }],  // text-xs → --font-sm (13px)  ❌
  'sm':  ['var(--font-base)', { lineHeight: '1.5rem' }],  // text-sm → --font-base (14px) ❌
  'base':['var(--font-lg)',  { lineHeight: '1.5rem' }],  // text-base → --font-lg (16px) ❌
  'lg':  ['var(--font-xl)',  { lineHeight: '1.75rem' }], // text-lg → --font-xl (18px) ❌
},
```

## 修复方案
```js
fontSize: {
  '2xs': ['var(--font-2xs)', { lineHeight: '1.25rem' }], // 11px
  'xs':  ['var(--font-xs)',  { lineHeight: '1.25rem' }], // 12px
  'sm':  ['var(--font-sm)',  { lineHeight: '1.5rem' }],  // 13px
  'base':['var(--font-base)', { lineHeight: '1.5rem' }], // 14px
  'lg':  ['var(--font-lg)',  { lineHeight: '1.75rem' }], // 16px
  'xl':  ['var(--font-xl)',  { lineHeight: '1.75rem' }], // 18px
  '2xl': ['var(--font-2xl)', { lineHeight: '2rem' }],    // 20px
},
```

## 验收标准
- [ ] tailwind.config.js 中 fontSize 映射正确
- [ ] 新增 text-2xs 和 text-2xl 支持
