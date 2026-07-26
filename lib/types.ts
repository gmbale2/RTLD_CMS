export type CmsRole = "admin" | "editor";

export interface CmsPost {
  id: string;
  title: string;
  section: "tarman_today" | "movie_updates";
  body: string | null;
  hero_image_url: string | null;
  vimeo_url: string | null;
  status: "draft" | "published";
  author_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WheelSegment {
  id: string;
  label: string;
  odds: number;
  active: boolean;
  prize_type: string;
  email_body: string | null;
}

export interface Prize {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  period_start: string | null;
  period_end: string | null;
  rank_from: number | null;
  rank_to: number | null;
  shopify_product_url: string | null;
  email_body: string | null;
}

export interface CmsConfig {
  key: string;
  value: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  username: string | null;
  email?: string | null;
  score: number;
  hidden: boolean | null;
  cms_role?: CmsRole | null;
  created_at: string;
}

export interface PushLog {
  id: string;
  title: string;
  body: string;
  category: string | null;
  deep_link: string | null;
  sent_at: string;
  recipient_count: number;
}

export interface AuditLog {
  id: string;
  action: string;
  performed_by: string | null;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}
