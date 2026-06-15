# Step 2: 统一 CSS 变量定义

## 任务
在 styles.css 中重新定义 --font-2xs 到 --font-2xl 的变量，建立基于基准字号的缩放比例。

## 当前 CSS 变量
```css
--font-xs: 0.75rem;    /* 12px */
--font-sm: 0.8125rem;  /* 13px */
--font-base: 0.875rem; /* 14px */
--font-lg: 1rem;       /* 16px */
--font-xl: 1.125rem;   /* 18px */
```

## 修复方案
增加 --font-2xs 和 --font-2xl，并统一命名：
```css
--font-2xs:  0.6875rem; /* 11px */
--font-xs:   0.75rem;   /* 12px */
--font-sm:   0.8125rem; /* 13px */
--font-base: 0.875rem;  /* 14px */
--font-lg:   1rem;      /* 16px */
--font-xl:   1.125rem;  /* 18px */
--font-2xl:  1.25rem;   /* 20px */
```

## 验收标准
- [ ] styles.css 中包含完整的 --font-2xs 到 --font-2xl 变量
- [ ] 变量值与 Tailwind 配置一致
