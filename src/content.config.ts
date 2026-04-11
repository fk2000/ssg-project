import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const ssgGuide = defineCollection({
	// 新しい方式では loader を使用して、対象のディレクトリとパターンを指定します
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/ssg-guide" }),
	schema: z.object({
		title: z.string(),
		chapter: z.number().optional(), // 章
		order: z.number().optional(),   // 節・順序
		status: z.enum(['draft', 'review', 'published']).default('draft'),
		tags: z.array(z.string()).optional(), // タグ
		summary: z.string().optional(), // 要約
	}),
});

const minecraftJavaFunction = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/minecraft-java-function" }),
	schema: z.object({
		title: z.string(),
		chapter: z.number().optional(),
		order: z.number().optional(),
		status: z.enum(['draft', 'review', 'published']).default('draft'),
		tags: z.array(z.string()).optional(),
		summary: z.string().optional(),
	}),
});

export const collections = {
	'ssg-guide': ssgGuide,
	'minecraft-java-function': minecraftJavaFunction,
};
