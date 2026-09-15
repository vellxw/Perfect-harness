import { z } from "zod";
export const UserReferenceSchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: z.string().regex(/^[a-f0-9]{64}$/),
    name: z.string().min(1).max(240),
    kind: z.enum(["text", "image"]),
    mimeType: z.enum(["text/plain", "image/png", "image/jpeg", "image/webp"]),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().positive().max(12000000),
    privacy: z.enum(["public", "private", "confidential"]),
    approvedAt: z.string().datetime(),
  })
  .strict();
export type UserReference = z.infer<typeof UserReferenceSchema>;
