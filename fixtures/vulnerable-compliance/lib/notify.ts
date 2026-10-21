import sgMail from "@sendgrid/mail";
import Mixpanel from "mixpanel";

// HIPAA-01: neither vendor signs a BAA (SendGrid refuses; Mixpanel unknown).
sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
const mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN!);

export async function appointmentReminder(to: string, when: string) {
  mixpanel.track("reminder_sent", { to });
  await sgMail.send({ to, from: "clinic@northwind.example", subject: "Appointment", text: `See you ${when}` });
}
