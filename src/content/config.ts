import { defineCollection, z } from 'astro:content';

const docSchema = z.object({
  title: z.string(),
  chapter: z.number().optional(),
  order: z.number().optional(),
  status: z.enum(['published', 'draft']).default('draft'),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  pubDate: z.coerce.date().optional(),
});

const minecraftJavaFunction = defineCollection({
  type: 'content',
  schema: docSchema,
});

const ssgGuide = defineCollection({
  type: 'content',
  schema: docSchema,
});

export const collections = {
  'minecraft-java-function': minecraftJavaFunction,
  'ssg-guide': ssgGuide,
};
