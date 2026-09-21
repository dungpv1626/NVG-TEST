/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-facade-proposal.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiFacadeProposalCodeSchema = z
  .string()
  .max(40)
  .regex(/^[a-z0-9_]+$/);

export type AiFacadeProposalCode = z.infer<typeof aiFacadeProposalCodeSchema>;

export const aiFacadeProposalHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export type AiFacadeProposalHex = z.infer<typeof aiFacadeProposalHexSchema>;

export const aiFacadeProposalSchema = z
  .object({
    /** Keep the brief's style unless the brief leaves it empty. */
    style: z
      .enum([
        'hien_dai',
        'tan_co_dien',
        'indochine',
        'mai_thai',
        'toi_gian',
        'nhiet_doi',
        'dia_trung_hai',
        'co_dien',
        'bac_au',
      ])
      .describe("Keep the brief's style unless the brief leaves it empty."),
    roof: z
      .object({
        type: z.enum(['flat', 'hip', 'gable', 'thai', 'japanese', 'mansard', 'mixed']),
        /** Null for a flat roof. */
        pitch_deg: z.number().int().gte(0).lte(60).nullable().describe('Null for a flat roof.'),
        material: aiFacadeProposalCodeSchema,
        colour: aiFacadeProposalCodeSchema,
      })
      .strict(),
    materials: z
      .array(
        z
          .object({
            where: z.enum([
              'base',
              'body',
              'accent',
              'trim',
              'railing',
              'gate',
              'fence',
              'main_door',
              'side_door',
              'window',
              'garage_door',
            ]),
            material: aiFacadeProposalCodeSchema,
            colour: aiFacadeProposalCodeSchema,
            /** Short Vietnamese note, e.g. «sơn mờ», «đá băm». */
            finish: z
              .string()
              .max(60)
              .nullable()
              .describe('Short Vietnamese note, e.g. «sơn mờ», «đá băm».'),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    palette: z
      .object({
        primary_hex: aiFacadeProposalHexSchema,
        secondary_hex: aiFacadeProposalHexSchema,
        accent_hex: aiFacadeProposalHexSchema.nullable(),
      })
      .strict(),
    /** Null when the house has no front yard or no gate. */
    gate: z
      .object({
        type: z.enum(['swing', 'sliding', 'folding']),
        /** Gate width, cm. */
        w: z.number().int().describe('Gate width, cm.'),
        /** Gate height, cm. */
        h: z.number().int().describe('Gate height, cm.'),
        material: aiFacadeProposalCodeSchema,
        colour: aiFacadeProposalCodeSchema,
      })
      .strict()
      .nullable()
      .describe('Null when the house has no front yard or no gate.'),
    /** Null when the house has no front yard or no fence. */
    fence: z
      .object({
        /** Fence height, cm. */
        h: z.number().int().describe('Fence height, cm.'),
        material: aiFacadeProposalCodeSchema,
        colour: aiFacadeProposalCodeSchema,
      })
      .strict()
      .nullable()
      .describe('Null when the house has no front yard or no fence.'),
    /** Railing code for every balcony listed as LOCKED. Null only when there is none. */
    balcony_railing: aiFacadeProposalCodeSchema
      .nullable()
      .describe('Railing code for every balcony listed as LOCKED. Null only when there is none.'),
    /** Parapet height above the roof slab, cm. Null when the roof has none. */
    parapet: z
      .number()
      .int()
      .nullable()
      .describe('Parapet height above the roof slab, cm. Null when the roof has none.'),
    /** Roof silhouette seen from the street as [x, z] points. Null lets the program draw it from type and pitch; give it only for a mixed roof. */
    roof_outline: z
      .array(z.array(z.number().int()).min(2).max(2))
      .min(2)
      .max(24)
      .nullable()
      .describe(
        'Roof silhouette seen from the street as [x, z] points. Null lets the program draw it from type and pitch; give it only for a mixed roof.',
      ),
    elements: z
      .array(
        z
          .object({
            kind: z.enum([
              'canopy',
              'column',
              'cladding',
              'louvre',
              'planter',
              'cornice',
              'eaves_band',
              'finial',
              'reveal',
              'arch',
              'oculus',
              'porch_roof',
            ]),
            /** [x0, z0, x1, z1] cm, inside the facade frame. The program draws the shape; the rectangle is always its bounding box. arch: the band above a door, drawn as an arc springing from z0 at both ends up to the crown at z1. oculus: a round window, drawn as the largest circle inside the rectangle. porch_roof: a gabled porch roof, drawn as a triangle with its ridge at the middle of z1. Only canopy, louvre, arch and porch_roof may cover an opening. */
            rect: z
              .array(z.number().int())
              .min(4)
              .max(4)
              .describe(
                '[x0, z0, x1, z1] cm, inside the facade frame. The program draws the shape; the rectangle is always its bounding box. arch: the band above a door, drawn as an arc springing from z0 at both ends up to the crown at z1. oculus: a round window, drawn as the largest circle inside the rectangle. porch_roof: a gabled porch roof, drawn as a triangle with its ridge at the middle of z1. Only canopy, louvre, arch and porch_roof may cover an opening.',
              ),
            /** Index into materials; null means the body material. */
            material_ref: z
              .number()
              .int()
              .gte(0)
              .nullable()
              .describe('Index into materials; null means the body material.'),
          })
          .strict(),
      )
      .max(40),
    /** Vietnamese, why this facade suits the brief. */
    rationale: z.string().max(1500).describe('Vietnamese, why this facade suits the brief.'),
  })
  .strict();

export type AiFacadeProposal = z.infer<typeof aiFacadeProposalSchema>;
