import { bookingSchema } from '@/lib/validation';
import { BookingConflictError, createPublicBooking } from '@/lib/repository';
import { errorResponse } from '@/lib/http';
import { triggerAppointmentBookedReminder } from '@/lib/whatsapp-reminders';

export async function POST(request: Request) {
  try {
    const input = bookingSchema.parse(await request.json());
    const appointment = await createPublicBooking(input);
    await triggerAppointmentBookedReminder(appointment.id).catch(() => null);
    return Response.json({ appointment }, { status: 201 });
  } catch (error) {
    if (error instanceof BookingConflictError) return Response.json({ error: error.message }, { status: 409 });
    return errorResponse(error);
  }
}
