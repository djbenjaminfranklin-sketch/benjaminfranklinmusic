import { Resend } from "resend";

interface BookingData {
  name: string;
  email: string;
  eventType: string;
  eventDate: string;
  venue: string;
  city: string;
  budget: string;
  message: string;
}

export async function sendBookingEmail(to: string, data: BookingData) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: "Booking <onboarding@resend.dev>",
    to,
    subject: `New Booking Request from ${data.name}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #c9a84c;">New Booking Request</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #666;">Name</td>
            <td style="padding: 8px 0;">${data.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #666;">Email</td>
            <td style="padding: 8px 0;"><a href="mailto:${data.email}">${data.email}</a></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #666;">Event Type</td>
            <td style="padding: 8px 0;">${data.eventType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #666;">Event Date</td>
            <td style="padding: 8px 0;">${data.eventDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #666;">Venue</td>
            <td style="padding: 8px 0;">${data.venue}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #666;">City</td>
            <td style="padding: 8px 0;">${data.city}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #666;">Budget</td>
            <td style="padding: 8px 0;">${data.budget}</td>
          </tr>
        </table>
        <div style="margin-top: 16px; padding: 16px; background: #f5f5f5; border-radius: 8px;">
          <p style="font-weight: bold; color: #666; margin: 0 0 8px;">Message</p>
          <p style="margin: 0; white-space: pre-wrap;">${data.message}</p>
        </div>
      </div>
    `,
  });
}
