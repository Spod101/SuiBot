export type UpdateRow = {
  id: string;
  chapter: string;
  owner: string;
  title: string;
  status: string;
  event_date: string | null;
  notes: string | null;
  pax_target: number | null;
  pax_actual: number | null;
  is_risk: boolean;
  created_at: string;
};

export type TelegramResult = {
  sent: boolean;
  error?: string;
  messageId?: number;
};

export type DashboardEvent = {
  slug: string;
  chapter: string;
  event_name: string;
  event_date: string | null;
  event_kind: string;
  status: string;
  pax_target: number | null;
  display_order: number;
};

export type DashboardConfigRow = {
  key: string;
  value_text: string | null;
  value_number: number | null;
};

export type TaskRow = {
  id: string;
  chapter: string;
  owner: string;
  title: string;
  status: string;
  due_date: string | null;
  notes: string | null;
  updated_at: string;
};

export type TelegramListItem = {
  chapter: string;
  title: string;
  status: string;
  dueDate: string | null;
};

export type ConfigMap = Map<string, { value_text: string | null; value_number: number | null }>;
