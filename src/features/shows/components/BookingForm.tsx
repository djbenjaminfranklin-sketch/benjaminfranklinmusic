"use client";

import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Send, Loader2, CheckCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import siteConfig from "../../../../site.config";
import Input from "@/shared/ui/Input";
import Button from "@/shared/ui/Button";
import { cn } from "@/shared/lib/utils";

const selectClass =
  "w-full rounded-lg bg-background border border-border px-4 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30";
const selectErrorClass = "border-red-500 focus:border-red-500 focus:ring-red-500/30";

export default function BookingForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const t = useTranslations("booking");

  const bookingSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, t("nameRequired")),
        email: z.string().email(t("emailInvalid")),
        phone: z.string().optional(),
        eventType: z.string().min(1, t("eventTypeRequired")),
        eventDate: z.string().min(1, t("dateRequired")),
        venue: z.string().min(2, t("venueRequired")),
        city: z.string().min(2, t("cityRequired")),
        message: z.string().min(10, t("messageMinLength")),
      }),
    [t],
  );

  type BookingFormData = z.infer<typeof bookingSchema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
  });

  const onSubmit = async (data: BookingFormData) => {
    setStatus("loading");
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to send");
      setStatus("success");
      reset();
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center">
        <CheckCircle className="h-12 w-12 text-green-400" />
        <h3 className="text-xl font-bold text-foreground">{t("requestSent")}</h3>
        <p className="text-sm text-foreground/60">
          {t("requestSentMessage")}
        </p>
        <Button variant="outline" onClick={() => setStatus("idle")}>
          {t("sendAnother")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label={t("nameLabel")}
          id="name"
          placeholder={t("namePlaceholder")}
          error={errors.name?.message}
          {...register("name")}
        />
        <Input
          label={t("emailLabel")}
          id="email"
          type="email"
          placeholder={t("emailPlaceholder")}
          error={errors.email?.message}
          {...register("email")}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label={t("phoneLabel")}
          id="phone"
          type="tel"
          placeholder={t("phonePlaceholder")}
          error={errors.phone?.message}
          {...register("phone")}
        />

        <div className="space-y-1.5">
          <label htmlFor="eventType" className="block text-sm font-medium text-foreground/70">
            {t("eventTypeLabel")}
          </label>
          <select
            id="eventType"
            className={cn(selectClass, errors.eventType && selectErrorClass)}
            defaultValue=""
            {...register("eventType")}
          >
            <option value="" disabled>
              {t("eventTypePlaceholder")}
            </option>
            {siteConfig.booking.eventTypeKeys.map((key) => (
              <option key={key} value={key}>
                {t(`eventTypes.${key}`)}
              </option>
            ))}
          </select>
          {errors.eventType && (
            <p className="text-xs text-red-400">{errors.eventType.message}</p>
          )}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label={t("eventDateLabel")}
          id="eventDate"
          type="date"
          error={errors.eventDate?.message}
          {...register("eventDate")}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label={t("venueLabel")}
          id="venue"
          placeholder={t("venuePlaceholder")}
          error={errors.venue?.message}
          {...register("venue")}
        />
        <Input
          label={t("cityLabel")}
          id="city"
          placeholder={t("cityPlaceholder")}
          error={errors.city?.message}
          {...register("city")}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="message" className="block text-sm font-medium text-foreground/70">
          {t("messageLabel")}
        </label>
        <textarea
          id="message"
          rows={4}
          placeholder={t("messagePlaceholder")}
          className={cn(
            "w-full rounded-lg bg-background border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 transition-colors focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 resize-none",
            errors.message && "border-red-500 focus:border-red-500 focus:ring-red-500/30"
          )}
          {...register("message")}
        />
        {errors.message && (
          <p className="text-xs text-red-400">{errors.message.message}</p>
        )}
      </div>

      {status === "error" && (
        <p className="text-sm text-red-400">
          {t("submitError")}
        </p>
      )}

      <Button type="submit" disabled={status === "loading"} size="lg" className="w-full sm:w-auto">
        {status === "loading" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("sending")}
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            {t("sendRequest")}
          </>
        )}
      </Button>
    </form>
  );
}
