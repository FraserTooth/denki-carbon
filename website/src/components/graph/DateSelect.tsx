import * as React from "react";
import Button from "@mui/material/Button";
import { DatePicker, DatePickerProps } from "@mui/x-date-pickers/DatePicker";
import { UseDateFieldProps } from "@mui/x-date-pickers/DateField";
import {
  BaseSingleInputFieldProps,
  DateValidationError,
  FieldSection,
} from "@mui/x-date-pickers/models";
import { DateTime } from "luxon";
import Typography from "@material-ui/core/Typography";
import { useTranslation } from "react-i18next";

interface ButtonFieldProps
  extends UseDateFieldProps<DateTime, false>,
    BaseSingleInputFieldProps<
      DateTime | null,
      DateTime,
      FieldSection,
      false,
      DateValidationError
    > {
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

function ButtonField(props: ButtonFieldProps) {
  const { t } = useTranslation();

  const {
    setOpen,
    label,
    id,
    disabled,
    InputProps: { ref } = {},
    inputProps: { "aria-label": ariaLabel } = {},
  } = props;

  return (
    <Button
      id={id}
      disabled={disabled}
      ref={ref}
      aria-label={ariaLabel}
      onClick={() => setOpen?.((prev) => !prev)}
      variant="outlined"
      size="small"
      style={{ position: "relative", bottom: "2px" }}
    >
      <Typography>{label ? `${label}` : t("today")}</Typography>
    </Button>
  );
}

function ButtonDatePicker(
  props: Omit<DatePickerProps<DateTime>, "open" | "onOpen" | "onClose">
) {
  const [open, setOpen] = React.useState(false);

  return (
    <DatePicker
      slots={{ ...props.slots, field: ButtonField }}
      slotProps={{ ...props.slotProps, field: { setOpen } as any }}
      {...props}
      open={open}
      onClose={() => setOpen(false)}
      onOpen={() => setOpen(true)}
      disableFuture={true}
    />
  );
}

interface PickerWithButtonFieldProps {
  graphDate: DateTime | null;
  setGraphDate: React.Dispatch<React.SetStateAction<DateTime | null>>;
}

export default function PickerWithButtonField(
  props: PickerWithButtonFieldProps
) {
  const { graphDate, setGraphDate } = props;
  return (
    <ButtonDatePicker
      label={graphDate == null ? null : graphDate.toFormat("yyyy/MM/dd")}
      value={graphDate}
      onChange={(newValue) =>
        setGraphDate(newValue?.setZone("Asia/Tokyo") || null)
      }
    />
  );
}
