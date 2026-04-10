import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const ssgGuide = defineCollection({
	// 新しい方式では loader を使用して、対象のディレクトリとパターンを指定します
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/ssg-guide" }),
	schema: z.object({
		title: z.string(),
		order: z.number().optional(),
		status: z.enum(['draft', 'review', 'published']).default('draft'), // 執筆状況
	}),
});

export const collections = {
	'ssg-guide': ssgGuide,
};
