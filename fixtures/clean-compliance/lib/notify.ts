import twilio from "twilio";

// Twilio signs a BAA; the message carries no PHI.
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function appointmentReminder(to: string) {
  await client.messages.create({ to, from: process.env.TWILIO_FROM!, body: "You have an upcoming appointment. Log in to see details." });
}
