import { INDIAN_STATES } from "../lib/india";
import { FormField } from "./ui";

export type AddressDraft = {
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
};

export const emptyAddress: AddressDraft = {
  recipient: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "Andhra Pradesh",
  pincode: ""
};

type Props = {
  value: AddressDraft;
  onChange: (field: keyof AddressDraft, value: string) => void;
  errors?: Record<string, string>;
  prefix: string;
  disabled?: boolean;
};

export function AddressFields({ value, onChange, errors = {}, prefix, disabled }: Props) {
  return (
    <div className="form-grid">
      <FormField
        label="Recipient name"
        htmlFor={`${prefix}-recipient`}
        error={errors.recipient}
        className="form-grid__full"
      >
        <input
          id={`${prefix}-recipient`}
          value={value.recipient}
          onChange={(event) => onChange("recipient", event.target.value)}
          autoComplete="name"
          maxLength={80}
          disabled={disabled}
          required
        />
      </FormField>
      <FormField label="Phone number" htmlFor={`${prefix}-phone`} error={errors.phone} hint="10-digit mobile number">
        <input
          id={`${prefix}-phone`}
          type="tel"
          inputMode="numeric"
          value={value.phone}
          onChange={(event) => onChange("phone", event.target.value.replace(/[^\d]/g, "").slice(0, 10))}
          autoComplete="tel"
          disabled={disabled}
          required
        />
      </FormField>
      <FormField label="PIN code" htmlFor={`${prefix}-pincode`} error={errors.pincode}>
        <input
          id={`${prefix}-pincode`}
          inputMode="numeric"
          value={value.pincode}
          onChange={(event) => onChange("pincode", event.target.value.replace(/\D/g, "").slice(0, 6))}
          autoComplete="postal-code"
          maxLength={6}
          disabled={disabled}
          required
        />
      </FormField>
      <FormField
        label="Address line 1"
        htmlFor={`${prefix}-line1`}
        error={errors.line1}
        hint="House or flat, building, street"
        className="form-grid__full"
      >
        <input
          id={`${prefix}-line1`}
          value={value.line1}
          onChange={(event) => onChange("line1", event.target.value)}
          autoComplete="address-line1"
          maxLength={160}
          disabled={disabled}
          required
        />
      </FormField>
      <FormField label="Address line 2" htmlFor={`${prefix}-line2`} error={errors.line2} hint="Landmark or area (optional)" className="form-grid__full">
        <input
          id={`${prefix}-line2`}
          value={value.line2}
          onChange={(event) => onChange("line2", event.target.value)}
          autoComplete="address-line2"
          maxLength={160}
          disabled={disabled}
        />
      </FormField>
      <FormField label="City" htmlFor={`${prefix}-city`} error={errors.city}>
        <input
          id={`${prefix}-city`}
          value={value.city}
          onChange={(event) => onChange("city", event.target.value)}
          autoComplete="address-level2"
          maxLength={80}
          disabled={disabled}
          required
        />
      </FormField>
      <FormField label="State" htmlFor={`${prefix}-state`} error={errors.state}>
        <select
          id={`${prefix}-state`}
          value={value.state}
          onChange={(event) => onChange("state", event.target.value)}
          autoComplete="address-level1"
          disabled={disabled}
          required
        >
          {INDIAN_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
      </FormField>
    </div>
  );
}
