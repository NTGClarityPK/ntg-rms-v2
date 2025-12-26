import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { SubscriptionService } from '../subscription.service';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private subscriptionService: SubscriptionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.tenantId) {
      throw new ForbiddenException('User or tenant not found');
    }

    try {
      const subscription = await this.subscriptionService.getSubscription(
        user.tenantId,
      );

      // Allow access if status is 'trial' or 'active'
      if (subscription.status === 'trial' || subscription.status === 'active') {
        // Check if trial has expired
        if (subscription.status === 'trial' && subscription.trialEndsAt) {
          const now = new Date();
          const trialEnd = new Date(subscription.trialEndsAt);
          if (now > trialEnd) {
            throw new ForbiddenException(
              'Trial period has expired. Please upgrade your subscription.',
            );
          }
        }
        return true;
      }

      // Block access if status is 'past_due' or 'cancelled'
      throw new ForbiddenException(
        `Subscription is ${subscription.status}. Please update your subscription to continue.`,
      );
    } catch (error) {
      // If subscription not found, allow access (for backwards compatibility)
      // In production, you might want to require a subscription
      if (error instanceof ForbiddenException) {
        throw error;
      }
      // Subscription not found - allow access for now
      // You can change this to throw ForbiddenException if you want to require subscriptions
      return true;
    }
  }
}


