import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const POST = async (request: Request) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.error();
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.error();
  }
  const text = await request.text();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-10-28.acacia",
  });
  const event = stripe.webhooks.constructEvent(
    text,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET,
  );

  switch (event.type) {
    case "invoice.paid": {
      // Atualizar o usuário com o seu novo plano
      const { customer, subscription, subscription_details } =
        event.data.object;

      const clerkUserId = subscription_details?.metadata?.clerk_user_id;
      if (!clerkUserId) {
        return NextResponse.error();
      }

      try {
        await clerkClient().users.updateUser(clerkUserId, {
          privateMetadata: {
            stripeCustomerId: customer,
            stripeSubscriptionId: subscription,
          },
          publicMetadata: {
            subscriptionPlan: "premium",
          },
        });
      } catch (error) {
        console.error("Error updating user in invoice.paid:", error);
        return NextResponse.error();
      }

      break;
    }

    case "customer.subscription.deleted": {
      // Remover plano premium do usuário
      try {
        const subscription = await stripe.subscriptions.retrieve(
          event.data.object.id,
        );

        const clerkUserId = subscription.metadata?.clerk_user_id;
        if (!clerkUserId) {
          return NextResponse.error();
        }

        await clerkClient().users.updateUser(clerkUserId, {
          privateMetadata: {
            stripeCustomerId: null,
            stripeSubscriptionId: null,
          },
          publicMetadata: {
            subscriptionPlan: null,
          },
        });
      } catch (error) {
        console.error(
          "Error updating user in customer.subscription.deleted:",
          error,
        );
        return NextResponse.error();
      }

      break;
    }

    default:
      console.warn("Unhandled event type:", event.type);
      return NextResponse.json({
        received: false,
        message: "Unhandled event type",
      });
  }

  return NextResponse.json({ received: true });
};
