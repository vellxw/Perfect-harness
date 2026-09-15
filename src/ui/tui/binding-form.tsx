import type { AgentProfile } from "../../skills/model.js";
import { BindingSchema } from "../../skills/model.js";
import type { Motion } from "../../presentation/protocol.js";
import { GuidedForm } from "./form.js";
export function BindingForm({
  profile,
  width,
  height,
  motion,
  onSave,
  onCancel,
}: {
  profile: AgentProfile;
  width: number;
  height: number;
  motion: Motion;
  onSave: (binding: AgentProfile["binding"]) => void;
  onCancel: () => void;
}) {
  return (
    <GuidedForm
      width={width}
      height={height}
      motion={motion}
      onCancel={onCancel}
      spec={{
        title: "Modelo · " + profile.name,
        fields: [
          {
            key: "provider",
            label: "Proveedor",
            initial: profile.binding.provider,
          },
          {
            key: "model",
            label: "Modelo exacto",
            initial: profile.binding.model,
          },
          {
            key: "reasoning",
            label: "Razonamiento",
            initial: profile.binding.reasoning,
            choices: [
              "off",
              "minimal",
              "low",
              "medium",
              "high",
              "xhigh",
              "max",
            ].map((value) => ({ value, label: value })),
          },
          {
            key: "accountRef",
            label: "Cuenta local",
            initial: profile.binding.accountRef,
          },
          {
            key: "auth",
            label: "Autenticación",
            initial: profile.binding.auth,
            choices: [
              { value: "oauth", label: "OAuth" },
              { value: "api_key", label: "API key local" },
            ],
          },
          {
            key: "billingMode",
            label: "Facturación",
            initial: profile.binding.billingMode,
            choices: [
              { value: "subscription", label: "Suscripción" },
              { value: "free", label: "Gratuita" },
              {
                value: "metered",
                label: "Por consumo (requiere permiso aparte)",
              },
            ],
          },
        ],
        submit: (values) =>
          onSave(BindingSchema.parse({ ...profile.binding, ...values })),
      }}
    />
  );
}
