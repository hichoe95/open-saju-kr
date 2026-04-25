-- Alert configuration defaults for app_config table
-- Adds threshold settings for automated monitoring alerts

INSERT INTO public.app_config (key, value, description, updated_at)
VALUES
  ('alert_error_rate_threshold', '5.0', '에러율 임계치 (%). 이 값을 초과하면 Slack 알림 발송', now()),
  ('alert_payment_failure_threshold', '3', '연속 결제 실패 임계치 (건). 이 값 이상 연속 실패 시 Slack 알림 발송', now()),
  ('alert_refund_spike_threshold', '200.0', '환불 급증 임계치 (%). 전일 대비 이 비율 초과 시 Slack 알림 발송', now()),
  ('slack_webhook_url', '', 'Slack Incoming Webhook URL. 비어있으면 알림 비활성화', now())
ON CONFLICT (key) DO NOTHING;
