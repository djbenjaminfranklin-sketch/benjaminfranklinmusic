import { NextResponse } from "next/server";
import { z } from "zod";
import siteConfig from "../../../../site.config";
import { sendBookingEmail } from "@/lib/email";

const bookingSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  eventType: z.string().min(1),
  eventDate: z.string().min(1),
  venue: z.string().min(2),
  city: z.string().min(2),
  message: z.string().min(10),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = bookingSchema.parse(body);

    if (!process.env.RESEND_API_KEY) {
      // Demo mode: return success without sending email
      return NextResponse.json({ success: true, demo: true });
    }

    await sendBookingEmail(siteConfig.booking.recipientEmail, {
      name: data.name,
      email: data.email,
      eventType: data.eventType,
      eventDate: data.eventDate,
      venue: data.venue,
      city: data.city,
      message: data.message,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid form data" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to send booking request" },
      { status: 500 }
    );
  }
}
