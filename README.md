# 个人网站 · 中文本地预览

基于 Magic UI Portfolio，沿用原版布局、视觉和交互。当前个人资料为占位，经历、技能、项目及活动为模板示例；博客包含中文排版示例和已标注的上游英文示例。

- 本地预览：`pnpm dev --hostname 127.0.0.1 --port 3010`，访问 `http://localhost:3010`。
- 正式构建：`pnpm build`；构建后运行 `pnpm start --hostname 127.0.0.1 --port 3010`。
- 个人资料和项目：`src/data/resume.tsx`；博客文章：`content/*.mdx`。
- 环境要求：Node.js 20.9 以上。本项目保留上游 MIT 许可。

<div align="center">
<img alt="Portfolio" src="https://github.com/dillionverma/portfolio/assets/16860528/57ffca81-3f0a-4425-b31d-094f61725455" width="90%">
</div>

# Portfolio [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdillionverma%2Fportfolio)

Built with next.js, [shadcn/ui](https://ui.shadcn.com/), and [magic ui](https://magicui.design/), deployed on Vercel.

# Features

- Setup only takes a few minutes by editing the [single config file](./src/data/resume.tsx)
- Built using Next.js 14, React, Typescript, Shadcn/UI, TailwindCSS, Framer Motion, Magic UI
- Includes a blog
- Responsive for different devices
- Optimized for Next.js and Vercel

# Getting Started Locally

1. Clone this repository to your local machine:

   ```bash
   git clone https://github.com/dillionverma/portfolio
   ```

2. Move to the cloned directory

   ```bash
   cd portfolio
   ```

3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Start the local Server:

   ```bash
   pnpm dev
   ```

5. Open the [Config file](./src/data/resume.tsx) and make changes

# License

Licensed under the [MIT license](https://github.com/dillionverma/portfolio/blob/main/LICENSE.md).
