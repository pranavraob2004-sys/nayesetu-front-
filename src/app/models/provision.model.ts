export interface ProvisionMeta {
  document_id: number;
  document_short_name?: string;
  number: string;
  title: string;
  type: string;
  unit_number?: string | null;
  unit_title?: string | null;
  status: string;
}

export interface Provision {
  meta: ProvisionMeta;
  full_text: string;
}
