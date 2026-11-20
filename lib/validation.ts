import { z } from "zod";

/** Lowercase, hyphen-separated, no leading/trailing hyphen. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const DOMAIN_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

const optionalSlug = z
  .union([
    z.literal(""),
    z
      .string()
      .trim()
      .max(120, "Slug is too long")
      .regex(SLUG_PATTERN, "Use lowercase letters, numbers and hyphens"),
  ])
  .optional();

const optionalUrl = z
  .union([z.literal(""), z.url("Enter a valid URL")])
  .optional();

const optionalEmail = z
  .union([z.literal(""), z.email("Enter a valid email")])
  .optional();

export const clientFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name is too long"),
  slug: optionalSlug,
  contactEmail: optionalEmail,
  notes: z.string().trim().max(2000, "Notes are too long").optional(),
});

export type ClientFormInput = z.infer<typeof clientFormSchema>;

export const projectFormSchema = z.object({
  clientId: z.uuid("Select a client"),
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name is too long"),
  slug: optionalSlug,
  domain: z
    .string()
    .trim()
    .min(1, "Domain is required")
    .max(253, "Domain is too long")
    .regex(DOMAIN_PATTERN, "Enter a valid domain, e.g. example.com"),
  cmsType: z.enum(["payload", "strapi", "other"]).default("payload"),
  cmsUrl: optionalUrl,
  astroRepoUrl: optionalUrl,
  cmsRepoUrl: optionalUrl,
});

export type ProjectFormInput = z.infer<typeof projectFormSchema>;

/** Linking a project to an existing Ploi server + site (M2). */
export const ploiLinkSchema = z.object({
  ploiServerId: z.number().int().positive().nullable(),
  ploiSiteId: z.number().int().positive().nullable(),
});

export type PloiLinkInput = z.infer<typeof ploiLinkSchema>;

/** Per-project content-backend audit token (M7). */
export const cmsTokenSchema = z.object({
  projectId: z.uuid("Select a project"),
  token: z
    .string()
    .trim()
    .min(1, "Token is required")
    .max(500, "Token is too long"),
});

export type CmsTokenInput = z.infer<typeof cmsTokenSchema>;

/**
 * The provisioning wizard (M3): everything needed to queue a `provision_site`
 * job. Builds on the project fields and adds the infrastructure choices.
 */
export const provisionWizardSchema = projectFormSchema.extend({
  ploiServerId: z.number().int().positive({ message: "Select a Ploi server" }),
  webDirectory: z
    .string()
    .trim()
    .min(1, "Web directory is required")
    .max(50, "Web directory is too long")
    .regex(/^[a-zA-Z0-9/]+$/, "Use only letters, numbers and slashes"),
  webserverTemplateId: z.number().int().positive().nullable().optional(),
  systemUser: z.string().trim().max(50, "System user is too long").optional(),
});

export type ProvisionWizardInput = z.infer<typeof provisionWizardSchema>;

/** Derive a URL-safe slug from an arbitrary name. */
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return slug.length > 0 ? slug : "item";
}
