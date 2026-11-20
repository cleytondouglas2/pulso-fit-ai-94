FROM php:8.3-apache-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends unzip libpq-dev libsqlite3-dev postgresql-client \
    && docker-php-ext-install pdo_mysql pdo_pgsql pdo_sqlite \
    && a2enmod rewrite headers setenvif \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /var/www/html
COPY source.zip /tmp/argus-source.zip
RUN unzip -q /tmp/argus-source.zip -d /tmp \
 && cp -a /tmp/argus_payments_php/. /var/www/html/ \
 && rm -rf /tmp/argus_payments_php /tmp/argus-source.zip \
 && mkdir -p /var/www/html/storage \
 && chown -R www-data:www-data /var/www/html/storage \
 && printf 'auto_prepend_file=/var/www/html/demo_guard.php\ndisplay_errors=Off\nexpose_php=Off\n' > /usr/local/etc/php/conf.d/zz-argus.ini \
 && printf 'SetEnvIfNoCase Authorization "^(.*)$" HTTP_AUTHORIZATION=$1\n' > /etc/apache2/conf-available/argus-auth.conf \
 && a2enconf argus-auth \
 && sed -i 's#DocumentRoot /var/www/html#DocumentRoot /var/www/html/public#g' /etc/apache2/sites-available/000-default.conf \
 && printf '<Directory /var/www/html/public>\nAllowOverride All\nRequire all granted\n</Directory>\n' >> /etc/apache2/sites-available/000-default.conf
COPY deployment/storage_probe.php /usr/local/share/argus/storage_probe.php
COPY deployment/backup_argus_schema.sh /usr/local/share/argus/backup_argus_schema.sh
COPY deployment/MIGRATION.md /usr/local/share/argus/MIGRATION.md
RUN php -l /usr/local/share/argus/storage_probe.php && bash -n /usr/local/share/argus/backup_argus_schema.sh
# ARGUS release patch: verified against 18/11 package; applied before built-in checks
RUN printf '%s' 'PD9waHAKJGJhc2UgPSBnZXRlbnYoJ0FSR1VTX1JPT1QnKSA/OiAnL3Zhci93d3cvaHRtbCc7CiRzdGF0aWMgPSBydHJpbSgkYmFzZSwgJy8nKSAuICcvcHVibGljL3N0YXRpYy8nOwpmdW5jdGlvbiB1cGRhdGVFeGFjdChzdHJpbmcgJHBhdGgsIHN0cmluZyAkb2xkLCBzdHJpbmcgJG5ldyk6IHZvaWQgewogICAgJHNvdXJjZSA9IGZpbGVfZ2V0X2NvbnRlbnRzKCRwYXRoKTsKICAgIGlmICgkc291cmNlID09PSBmYWxzZSB8fCAoIXN0cl9jb250YWlucygkc291cmNlLCAkb2xkKSAmJiAhc3RyX2NvbnRhaW5zKCRzb3VyY2UsICRuZXcpKSkgewogICAgICAgIHRocm93IG5ldyBSdW50aW1lRXhjZXB0aW9uKCdBUkdVUyBwYXRjaDogc291cmNlIG1pc21hdGNoIGluICcuYmFzZW5hbWUoJHBhdGgpKTsKICAgIH0KICAgIGlmIChzdHJfY29udGFpbnMoJHNvdXJjZSwgJG9sZCkpIHsKICAgICAgICAkdXBkYXRlZCA9IHN0cl9yZXBsYWNlKCRvbGQsICRuZXcsICRzb3VyY2UpOwogICAgICAgIGlmIChmaWxlX3B1dF9jb250ZW50cygkcGF0aCwgJHVwZGF0ZWQpID09PSBmYWxzZSkgdGhyb3cgbmV3IFJ1bnRpbWVFeGNlcHRpb24oJ0FSR1VTIHBhdGNoOiB3cml0ZSBmYWlsZWQnKTsKICAgIH0KfQp1cGRhdGVFeGFjdCgkc3RhdGljLidhZG1pbi5odG1sJywgJ3BvbGlzaC5jc3M/dj00JywgJ3BvbGlzaC5jc3M/dj01Jyk7CnVwZGF0ZUV4YWN0KCRzdGF0aWMuJ2FkbWluLmh0bWwnLCAnYWRtaW4uanM/dj02JywgJ2FkbWluLmpzP3Y9NycpOwokb2xkID0gPDw8J0VORCcKY29uc3QgY3NyZj0oKT0+ZGVjb2RlVVJJQ29tcG9uZW50KChkb2N1bWVudC5jb29raWUubWF0Y2goLyg/Ol58O1xzKilhcmdfYWRtaW5fY3NyZj0oW147XSopLyl8fFtdKVsxXXx8JycpOwpFTkQ7CiRuZXcgPSA8PDwnRU5EJwpjb25zdCBjc3JmPSgpPT57dHJ5e3JldHVybiBkZWNvZGVVUklDb21wb25lbnQoKGRvY3VtZW50LmNvb2tpZS5tYXRjaCgvKD86Xnw7XHMqKWFyZ19hZG1pbl9jc3JmPShbXjtdKikvKXx8W10pWzFdfHwnJyl9Y2F0Y2h7cmV0dXJuICcnfX07CkVORDsKdXBkYXRlRXhhY3QoJHN0YXRpYy4nYWRtaW4uanMnLCAkb2xkLCAkbmV3KTsKJGNzcyA9IDw8PCdFTkQnCgovKiBJbXByb3ZlZCBuYXZpZ2F0aW9uIGNvbnRyYXN0IG9uIGRlc2t0b3AgYW5kIG1vYmlsZTsgYWN0aXZlIGl0ZW0gcmV0YWlucyBvcmlnaW5hbCBBUkdVUyBnb2xkLiAqLwouc2lkZWJhciAubWVudS1sYWJlbHtjb2xvcjojYmRiMDlhIWltcG9ydGFudH0KLnNpZGViYXIgLm1lbnUtaXRlbXtjb2xvcjojZDVkNGQxIWltcG9ydGFudH0KLnNpZGViYXIgLm1lbnUtaXRlbT5zcGFuOmZpcnN0LWNoaWxke2NvbG9yOiNlMGM2OWIhaW1wb3J0YW50fQouc2lkZWJhciAubWVudS1pdGVtLmFjdGl2ZXtjb2xvcjojZmZlMGE1IWltcG9ydGFudH0KLnNpZGViYXIgLm1lbnUtaXRlbTpob3Zlciwuc2lkZWJhciAubWVudS1pdGVtOmZvY3VzLXZpc2libGV7Y29sb3I6I2ZmZGQ5ZiFpbXBvcnRhbnR9CkVORDsKJHBhdGggPSAkc3RhdGljLidwb2xpc2guY3NzJzsKJHNvdXJjZSA9IGZpbGVfZ2V0X2NvbnRlbnRzKCRwYXRoKTsKaWYgKCRzb3VyY2UgPT09IGZhbHNlKSB0aHJvdyBuZXcgUnVudGltZUV4Y2VwdGlvbignQVJHVVMgcGF0Y2g6IG1pc3Npbmcgc3R5bGVzaGVldCcpOwppZiAoIXN0cl9jb250YWlucygkc291cmNlLCAnSW1wcm92ZWQgbmF2aWdhdGlvbiBjb250cmFzdCBvbiBkZXNrdG9wIGFuZCBtb2JpbGUnKSkgewogICAgZmlsZV9wdXRfY29udGVudHMoJHBhdGgsIHJ0cmltKCRzb3VyY2UsICJcbiIpLiJcbiIuJGNzcy4iXG4iKTsKfQpmb3JlYWNoIChbJ2FkbWluLmh0bWwnPT4ncG9saXNoLmNzcz92PTUnLCAnYWRtaW4uanMnPT4nY29uc3QgY3NyZj0oKT0+e3RyeXtyZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50JywgJ3BvbGlzaC5jc3MnPT4nLnNpZGViYXIgLm1lbnUtaXRlbXtjb2xvcjojZDVkNGQxIWltcG9ydGFudH0nXSBhcyAkZmlsZT0+JG5lZWRsZSkgewogICAgaWYgKCFzdHJfY29udGFpbnMoZmlsZV9nZXRfY29udGVudHMoJHN0YXRpYy4kZmlsZSksICRuZWVkbGUpKSB0aHJvdyBuZXcgUnVudGltZUV4Y2VwdGlvbignQVJHVVMgcGF0Y2ggdmVyaWZpY2F0aW9uIGZhaWxlZDogJy4kZmlsZSk7Cn0KZWNobyAiQVJHVVMgVUkgcmVsZWFzZSBwYXRjaCBhcHBsaWVkIGFuZCB2ZXJpZmllZFxuIjsK' | base64 -d > /tmp/argus_release_patch.php \
 && php /tmp/argus_release_patch.php \
 && rm /tmp/argus_release_patch.php
# ARGUS customer release: independent client portal, self-registration and private merchant credentials.
COPY deployment/Portal.php /var/www/html/src/Portal.php
COPY deployment/client.html deployment/docs.html deployment/portal.js deployment/portal.css deployment/qrcode.min.js /var/www/html/public/static/
COPY deployment/argus_customer_release.php /tmp/argus_customer_release.php
RUN php -l /tmp/argus_customer_release.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_customer_release.php \
 && php -l /var/www/html/src/Portal.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /var/www/html/src/Admin.php \
 && php /var/www/html/tests/ui_contract.php
# Crop the original ARGUS letter A without redraw: true transparency, lossless branding.
RUN apt-get update && apt-get install -y --no-install-recommends imagemagick \
 && rm -rf /var/lib/apt/lists/* \
 && convert /var/www/html/public/static/assets/argus-payments-logo-transparent.webp \
    -crop 450x355+0+0 +repage \
    \( -size 450x355 xc:none -fill white -draw 'polygon 0,0 360,0 370,120 375,180 390,230 414,275 442,325 442,336 245,336 245,355 0,355' \) \
    -compose DstIn -composite \
    -filter Lanczos -resize 470x470 -gravity center -background none -extent 512x512 \
    /var/www/html/public/static/assets/argus-icon-512.png \
 && convert /var/www/html/public/static/assets/argus-icon-512.png -resize 192x192 \
    /var/www/html/public/static/assets/argus-icon-192.png \
 && convert /var/www/html/public/static/assets/argus-icon-512.png -resize 180x180 \
    /var/www/html/public/static/assets/argus-icon-180.png \
 && identify /var/www/html/public/static/assets/argus-icon-192.png
# iOS web clips require an opaque PNG. Compose the ORIGINAL ARGUS mark over its dark brand background.
RUN convert -size 512x512 xc:'#10141a' /var/www/html/public/static/assets/argus-icon-512.png \
     -compose Over -composite -alpha off -strip /tmp/argus-opaque-512.png \
 && mv /tmp/argus-opaque-512.png /var/www/html/public/static/assets/argus-icon-512.png \
 && convert /var/www/html/public/static/assets/argus-icon-512.png -resize 192x192 /var/www/html/public/static/assets/argus-icon-192.png \
 && convert /var/www/html/public/static/assets/argus-icon-512.png -resize 180x180 /var/www/html/public/static/assets/argus-icon-180.png \
 && cp /var/www/html/public/static/assets/argus-icon-180.png /var/www/html/public/apple-touch-icon.png \
 && identify /var/www/html/public/apple-touch-icon.png
# Standards-based VAPID Web Push: HTTPS payload encryption and browser push transports.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libcurl4-openssl-dev libonig-dev libgmp-dev librsvg2-bin \
 && docker-php-ext-install -j$(nproc) curl mbstring gmp \
 && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
COPY deployment/composer.json /var/www/html/composer.json
RUN COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --no-interaction --prefer-dist --no-progress --optimize-autoloader --no-scripts
COPY deployment/Notifications.php /var/www/html/src/Notifications.php
COPY deployment/notifications-ui.js deployment/notifications-ui.css /var/www/html/public/static/
COPY deployment/install.html /var/www/html/public/static/install.html
COPY deployment/sw.js /var/www/html/public/sw.js
COPY deployment/pix-cachorro.svg /var/www/html/public/static/assets/pix-cachorro.svg
RUN rsvg-convert -w 512 -h 512 /var/www/html/public/static/assets/pix-cachorro.svg -o /var/www/html/public/static/assets/pix-cachorro.png \
 && test -s /var/www/html/public/static/assets/pix-cachorro.png
COPY deployment/notifications_test.php /var/www/html/tests/notifications_test.php
COPY deployment/notify_worker.php /usr/local/share/argus/notify_worker.php
COPY deployment/argus_notification_patch.php /tmp/argus_notification_patch.php
RUN php -l /tmp/argus_notification_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_notification_patch.php \
 && php -l /var/www/html/src/Notifications.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /var/www/html/src/Admin.php \
 && php -l /var/www/html/src/Portal.php \
 && php -l /var/www/html/src/LivePix.php \
 && php /var/www/html/tests/ui_contract.php \
 && php /var/www/html/tests/notifications_test.php \
 && php -l /usr/local/share/argus/notify_worker.php
RUN php -l src/Integrations/MisticPayFinance.php && php -l src/Security2FA.php && php -l src/Integrations/MisticPayPayout.php && php -l src/Admin.php && php -l src/Gateway.php && php -l src/LivePix.php && php tests/finance_qr_unit.php && php tests/security_2fa_unit.php && php tests/shared_pgsql_unit.php && php tests/b2b_unit.php && php tests/live_pix_unit.php && php tests/admin_http.php && php tests/ui_contract.php
# ARGUS IA: Groq is optional. Aggregated insights/heuristic alerts work without a paid API.
COPY deployment/AI.php /var/www/html/src/AI.php
COPY deployment/ai-ui.js deployment/ai-ui.css /var/www/html/public/static/
COPY deployment/ai_test.php /var/www/html/tests/ai_test.php
COPY deployment/argus_ai_patch.php /tmp/argus_ai_patch.php
RUN php -l /var/www/html/src/AI.php \
 && php -l /tmp/argus_ai_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_ai_patch.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /var/www/html/src/Admin.php \
 && php -l /var/www/html/src/Portal.php \
 && php -l /usr/local/share/argus/notify_worker.php \
 && php /var/www/html/tests/ai_test.php \
 && php /var/www/html/tests/ui_contract.php \
 && php /var/www/html/tests/notifications_test.php
# Validity checks and Pix authentication probes are read-only; only the original payment provider creates charges.
COPY deployment/DocumentValidation.php deployment/PixDiagnostics.php /var/www/html/src/
COPY deployment/pix-diagnostics.js /var/www/html/public/static/
COPY deployment/document_validation_test.php /var/www/html/tests/document_validation_test.php
COPY deployment/argus_document_pix_patch.php /tmp/argus_document_pix_patch.php
RUN php -l /var/www/html/src/DocumentValidation.php \
 && php -l /var/www/html/src/PixDiagnostics.php \
 && php -l /tmp/argus_document_pix_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_document_pix_patch.php \
 && php -l /var/www/html/src/Portal.php \
 && php -l /var/www/html/src/Admin.php \
 && php -l /var/www/html/src/Gateway.php \
 && php /var/www/html/tests/document_validation_test.php \
 && php /var/www/html/tests/ui_contract.php \
 && php /var/www/html/tests/notifications_test.php
# Reject legacy MisticPay pk/sk or ci/cs from being misused as MisticPay Finance QR credentials.
COPY deployment/argus_finance_guard_patch.php /tmp/argus_finance_guard_patch.php
COPY deployment/finance_credential_guard_test.php /var/www/html/tests/finance_credential_guard_test.php
RUN php -l /tmp/argus_finance_guard_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_finance_guard_patch.php \
 && php -l /var/www/html/src/Integrations/MisticPayFinance.php \
 && php -l /var/www/html/src/PixDiagnostics.php \
 && php /var/www/html/tests/finance_credential_guard_test.php \
 && php /var/www/html/tests/finance_qr_unit.php \
 && php /var/www/html/tests/ui_contract.php
# Protected traditional MisticPay Pix: ask for real payer details at charge confirmation.
COPY deployment/quick-pix-autostatus.js /var/www/html/public/static/quick-pix-autostatus.js
COPY deployment/TraditionalQuickPix.php /var/www/html/src/TraditionalQuickPix.php
COPY deployment/argus_traditional_quick_patch.php /tmp/argus_traditional_quick_patch.php
COPY deployment/traditional_quick_unit.php /var/www/html/tests/traditional_quick_unit.php
RUN php -l /var/www/html/src/TraditionalQuickPix.php \
 && php -l /tmp/argus_traditional_quick_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_traditional_quick_patch.php \
 && php -l /var/www/html/src/Admin.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /usr/local/share/argus/notify_worker.php \
 && php -l /usr/local/share/argus/storage_probe.php \
 && test -s /var/www/html/public/static/quick-pix-autostatus.js \
 && php /var/www/html/tests/traditional_quick_unit.php \
 && php /var/www/html/tests/finance_qr_unit.php \
 && php /var/www/html/tests/ui_contract.php

# PF/PJ registration for existing admins and clients; amount-only Pix uses encrypted server profile.
COPY deployment/IdentityProfile.php /var/www/html/src/IdentityProfile.php
COPY deployment/account-profile.js /var/www/html/public/static/account-profile.js
COPY deployment/argus_identity_patch.php /tmp/argus_identity_patch.php
COPY deployment/identity_profile_test.php /var/www/html/tests/identity_profile_test.php
RUN php -l /var/www/html/src/IdentityProfile.php \
 && php -l /tmp/argus_identity_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_identity_patch.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /var/www/html/src/Portal.php \
 && php -l /var/www/html/src/Admin.php \
 && php -l /var/www/html/src/TraditionalQuickPix.php \
 && php /var/www/html/tests/identity_profile_test.php \
 && php /var/www/html/tests/traditional_quick_unit.php \
 && php /var/www/html/tests/ui_contract.php

# QR receipt display only: retain all ARGUS pages, handlers, finance and automatic reconciliation.
COPY deployment/quick-pix-receipt.js deployment/quick-pix-receipt.css /var/www/html/public/static/
COPY deployment/quick_pix_receipt_patch.php /tmp/quick_pix_receipt_patch.php
COPY deployment/quick_pix_receipt_test.php /var/www/html/tests/quick_pix_receipt_test.php
RUN php -l /tmp/quick_pix_receipt_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/quick_pix_receipt_patch.php \
 && php /var/www/html/tests/quick_pix_receipt_test.php \
 && php /var/www/html/tests/identity_profile_test.php \
 && php /var/www/html/tests/traditional_quick_unit.php \
 && php /var/www/html/tests/ui_contract.php

# iOS home-screen icon: explicit, centered gold A; never crop the old wordmark.
# Pix UI: modal reuses existing receipt/QR/reconcile; success follows verified provider status.
COPY deployment/quick-pix-popup.js deployment/quick-pix-popup.css /var/www/html/public/static/
COPY deployment/argus-letter-a-icon.svg /var/www/html/public/static/assets/argus-letter-a-icon.svg
RUN rsvg-convert -w 512 -h 512 /var/www/html/public/static/assets/argus-letter-a-icon.svg -o /tmp/argus-new-a-512.png \
 && convert /tmp/argus-new-a-512.png -background '#141820' -alpha remove -alpha off -strip /var/www/html/public/static/assets/argus-a-512-v6.png \
 && convert /var/www/html/public/static/assets/argus-a-512-v6.png -resize 192x192 -strip /var/www/html/public/static/assets/argus-a-192-v6.png \
 && convert /var/www/html/public/static/assets/argus-a-512-v6.png -resize 180x180 -strip /var/www/html/public/apple-touch-icon-argus-a-v6.png \
 && cp /var/www/html/public/apple-touch-icon-argus-a-v6.png /var/www/html/public/apple-touch-icon.png \
 && cp /var/www/html/public/apple-touch-icon-argus-a-v6.png /var/www/html/public/static/assets/argus-icon-180.png \
 && cp /var/www/html/public/static/assets/argus-a-192-v6.png /var/www/html/public/static/assets/argus-icon-192.png \
 && cp /var/www/html/public/static/assets/argus-a-512-v6.png /var/www/html/public/static/assets/argus-icon-512.png \
 && test "$(identify -format '%[opaque]' /var/www/html/public/apple-touch-icon-argus-a-v6.png)" = "true"
COPY deployment/argus_pix_popup_icon_patch.php /tmp/argus_pix_popup_icon_patch.php
COPY deployment/argus_pix_popup_icon_test.php /var/www/html/tests/argus_pix_popup_icon_test.php
RUN php -l /tmp/argus_pix_popup_icon_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_pix_popup_icon_patch.php \
 && php /var/www/html/tests/argus_pix_popup_icon_test.php \
 && php /var/www/html/tests/quick_pix_receipt_test.php \
 && php /var/www/html/tests/identity_profile_test.php \
 && php /var/www/html/tests/traditional_quick_unit.php \
 && php /var/www/html/tests/ui_contract.php

# Silent Pix UI: keep server reconciliation after QR popup closes, stop after 30 min.
# Do not modify payment creation, status validation, permissions or other pages.
COPY deployment/argus_pix_30m_patch.php /tmp/argus_pix_30m_patch.php
COPY deployment/argus_pix_30m_ui_patch.php /tmp/argus_pix_30m_ui_patch.php
COPY deployment/argus_pix_30m_test.php /var/www/html/tests/argus_pix_30m_test.php
RUN php -l /tmp/argus_pix_30m_patch.php \
 && php -l /tmp/argus_pix_30m_ui_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_pix_30m_ui_patch.php \
 && php -l /var/www/html/src/TraditionalQuickPix.php \
 && php /var/www/html/tests/argus_pix_30m_test.php \
 && php /var/www/html/tests/identity_profile_test.php \
 && php /var/www/html/tests/ui_contract.php

# Full PF/PJ KYC: encrypted documentary evidence in persistent Postgres, independent staff
# review, immutable audit history, customer onboarding and provider-safe payment gates.
COPY deployment/KycStudio.php /var/www/html/src/KycStudio.php
COPY deployment/kyc-portal.js deployment/kyc-portal.css deployment/kyc-studio.js deployment/kyc-studio.css /var/www/html/public/static/
COPY deployment/argus_kyc_studio_patch.php /tmp/argus_kyc_studio_patch.php
COPY deployment/kyc_studio_test.php /var/www/html/tests/kyc_studio_test.php
RUN php -d display_errors=1 -d log_errors=0 -l /var/www/html/src/KycStudio.php \
 && php -l /tmp/argus_kyc_studio_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_kyc_studio_patch.php \
 && php -l /var/www/html/src/Portal.php \
 && php -l /var/www/html/src/Admin.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /var/www/html/src/KycStudio.php \
 && php -d display_errors=1 -d log_errors=0 /var/www/html/tests/kyc_studio_test.php \
 && php /var/www/html/tests/identity_profile_test.php \
 && php /var/www/html/tests/ui_contract.php

# Unified QR history: recent ledger inside existing QR panel; authenticated status
# and original popup used on "Ver Pix"; 30-minute expiry; correct old qpx_ reconciliation.
COPY deployment/quick-pix-history.js deployment/quick-pix-history.css /var/www/html/public/static/
COPY deployment/argus_pix_history_patch.php /tmp/argus_pix_history_patch.php
COPY deployment/argus_pix_history_test.php /var/www/html/tests/argus_pix_history_test.php
RUN php -l /tmp/argus_pix_history_patch.php \
 && php -l /var/www/html/tests/argus_pix_history_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_pix_history_patch.php \
 && php -l /var/www/html/src/Admin.php \
 && php -l /var/www/html/src/TraditionalQuickPix.php \
 && php -d display_errors=1 -d log_errors=0 /var/www/html/tests/argus_pix_history_test.php \
 && php /var/www/html/tests/ui_contract.php

# Super Admin payout readiness. Read-only checks; withdrawal, 2FA, provider scopes
# and original idempotent money movement remain intentionally unchanged.
COPY deployment/payout-readiness.js deployment/payout-readiness.css /var/www/html/public/static/
COPY deployment/payout_readiness_patch.php /tmp/payout_readiness_patch.php
COPY deployment/payout_readiness_test.php /var/www/html/tests/payout_readiness_test.php
RUN php -l /tmp/payout_readiness_patch.php \
 && php -d display_errors=1 -d log_errors=0 /tmp/payout_readiness_patch.php \
 && php -l /var/www/html/src/Admin.php \
 && php -d display_errors=1 -d log_errors=0 /var/www/html/tests/payout_readiness_test.php \
 && php /var/www/html/tests/ui_contract.php

# Super Admin tariff controls: MisticPay provider costs vs ARGUS fixed/percentage
# commercial rates, persisted in PostgreSQL and auditable. This stage does not
# alter Pix creation, settlement, merchant ledgers, payout body or other screens.
COPY deployment/FeePolicy.php /var/www/html/src/FeePolicy.php
COPY deployment/fee-studio.js deployment/fee-studio.css /var/www/html/public/static/
COPY deployment/argus_fee_studio_patch.php /tmp/argus_fee_studio_patch.php
COPY deployment/fee_studio_test.php /var/www/html/tests/fee_studio_test.php
RUN php -l /var/www/html/src/FeePolicy.php \
 && php -l /tmp/argus_fee_studio_patch.php \
 && php -d display_errors=1 -d log_errors=0 /tmp/argus_fee_studio_patch.php \
 && php -l /var/www/html/src/Admin.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -d display_errors=1 -d log_errors=0 /var/www/html/tests/fee_studio_test.php \
 && php /var/www/html/tests/ui_contract.php

# Bind fee policy to new, authenticated Pix deposits and real payout submissions.
# Fee snapshots use a unique per-operation ledger. PSP cost is NEVER charged
# twice. A real payout fee changes the amount SENT only after confirmation.
COPY deployment/FeeExecution.php /var/www/html/src/FeeExecution.php
COPY deployment/fee-operations.js deployment/fee-operations.css /var/www/html/public/static/
COPY deployment/argus_fee_execution_patch.php /tmp/argus_fee_execution_patch.php
COPY deployment/fee_execution_test.php /var/www/html/tests/fee_execution_test.php
RUN php -l /var/www/html/src/FeeExecution.php \
 && php -l /tmp/argus_fee_execution_patch.php \
 && php -d display_errors=1 -d log_errors=0 /tmp/argus_fee_execution_patch.php \
 && php -l /var/www/html/src/Admin.php \
 && php -l /var/www/html/src/TraditionalQuickPix.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -d display_errors=1 -d log_errors=0 /var/www/html/tests/fee_execution_test.php \
 && php /var/www/html/tests/ui_contract.php

# Seller wallets, API credentials and integration docs. Financial provider custody
# is NOT enabled automatically: both merchant custody and matched PSP account
# must be explicitly homologated. Test two synthetic merchants, never real money.
COPY deployment/MerchantWallet.php /var/www/html/src/MerchantWallet.php
COPY deployment/merchant-portal.js deployment/merchant-portal.css deployment/merchant-docs.js deployment/merchant-docs.css deployment/merchant-admin.js deployment/merchant-admin.css /var/www/html/public/static/
COPY deployment/merchant_wallet_patch.php /tmp/merchant_wallet_patch.php
COPY deployment/merchant_wallet_test.php /var/www/html/tests/merchant_wallet_test.php
RUN php -l /var/www/html/src/MerchantWallet.php \
 && php -l /tmp/merchant_wallet_patch.php \
 && php -l /var/www/html/tests/merchant_wallet_test.php \
 && php -d display_errors=1 -d log_errors=0 /tmp/merchant_wallet_patch.php \
 && php -l /var/www/html/src/Admin.php \
 && php -l /var/www/html/src/Portal.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /usr/local/share/argus/notify_worker.php \
 && php -d display_errors=1 -d log_errors=0 /var/www/html/tests/merchant_wallet_test.php \
 && php /var/www/html/tests/ui_contract.php


# Administrator API Keys: selected verified seller, one-time secret and MFA.
# The current v2 integration guide is prominent; legacy v1 stays available.
COPY deployment/admin-api-keys.js deployment/admin-api-keys.css /var/www/html/public/static/
COPY deployment/argus_admin_keys_patch.php /tmp/argus_admin_keys_patch.php
COPY deployment/admin_api_keys_test.php /var/www/html/tests/admin_api_keys_test.php
RUN php -l /tmp/argus_admin_keys_patch.php \
 && php -d display_errors=1 -d log_errors=0 /tmp/argus_admin_keys_patch.php \
 && php -l /var/www/html/src/Admin.php \
 && php -l /var/www/html/tests/admin_api_keys_test.php \
 && php /var/www/html/tests/admin_api_keys_test.php \
 && php /var/www/html/tests/ui_contract.php


# Seller self-service: real account eligibility, CSRF-protected own-key creation,
# no per-key administrative approval, correct customer/mobile navigation.
COPY deployment/argus_seller_keys_patch.php /tmp/argus_seller_keys_patch.php
COPY deployment/seller_self_keys_test.php /var/www/html/tests/seller_self_keys_test.php
COPY deployment/seller_key_auth_integration_test.php /var/www/html/tests/seller_key_auth_integration_test.php
RUN php -l /tmp/argus_seller_keys_patch.php \
 && php -d display_errors=1 -d log_errors=0 /tmp/argus_seller_keys_patch.php \
 && php -l /var/www/html/src/Portal.php \
 && php -l /var/www/html/tests/seller_self_keys_test.php \
 && php /var/www/html/tests/seller_self_keys_test.php \
 && php -l /var/www/html/tests/seller_key_auth_integration_test.php \
 && php /var/www/html/tests/seller_key_auth_integration_test.php


# Centralized API V2 payout permissions: all PSP secrets stay in the ARGUS
# server, sellers use their own key and verified CPF/CNPJ as Pix beneficiary.
COPY deployment/central_api_proxy_test.php /var/www/html/tests/central_api_proxy_test.php
RUN php -l /var/www/html/src/IdentityProfile.php \
 && php -l /var/www/html/src/Portal.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && php -l /var/www/html/tests/central_api_proxy_test.php \
 && php /var/www/html/tests/central_api_proxy_test.php


# Synthetic merchant checkout E2E: authenticated seller key -> central MisticPay
# request shape -> fake PSP QR -> own seller QR panel -> paid-only wallet credit.
# No network requests, production credentials or monetary transfers.
COPY deployment/seller_pix_e2e_test.php /var/www/html/tests/seller_pix_e2e_test.php
RUN php -l /var/www/html/src/MerchantWallet.php \
 && php -l /var/www/html/tests/seller_pix_e2e_test.php \
 && php /var/www/html/tests/seller_pix_e2e_test.php


# Admin approval fix: show uploaded documents in the authenticated Central KYC,
# enforce identity review before finance, and replace the broken legacy 503 links.
# This is a UI/navigation fix, NOT automatic KYC or financial approval.
COPY deployment/kyc_review_assets_patch.php /tmp/kyc_review_assets_patch.php
COPY deployment/kyc_review_bridge_test.php /var/www/html/tests/kyc_review_bridge_test.php
RUN php -l /tmp/kyc_review_assets_patch.php \
 && php -d display_errors=1 -d log_errors=0 /tmp/kyc_review_assets_patch.php \
 && php -l /var/www/html/src/KycStudio.php \
 && php -l /var/www/html/tests/kyc_review_bridge_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/kyc_review_bridge_test.php


# iOS KYC protected viewer: same-origin image URLs, page-by-page server PDF
# rasterization instead of Safari blob: PDF iframes. Original evidence remains
# encrypted in Postgres, with reviewer role/ownership and access audit unchanged.
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils \
 && rm -rf /var/lib/apt/lists/*
COPY deployment/KycDocumentPreview.php /var/www/html/src/KycDocumentPreview.php
COPY deployment/kyc_ios_preview_assets_patch.php /tmp/kyc_ios_preview_assets_patch.php
COPY deployment/kyc_ios_preview_test.php /var/www/html/tests/kyc_ios_preview_test.php
RUN php -l /var/www/html/src/KycDocumentPreview.php \
 && php -l /var/www/html/src/KycStudio.php \
 && php -l /tmp/kyc_ios_preview_assets_patch.php \
 && php -d display_errors=1 -d log_errors=0 /tmp/kyc_ios_preview_assets_patch.php \
 && php -l /var/www/html/tests/kyc_ios_preview_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/kyc_ios_preview_test.php


# Customer identity: guided camera face capture with blink/turn challenges.
# Browser landmark signals are untrusted advisory evidence, never an automatic
# identity decision or substitute for approved bank-grade liveness/PAD.
COPY deployment/FaceCapture.php /var/www/html/src/FaceCapture.php
COPY deployment/face-capture.js deployment/face-capture.css /var/www/html/public/static/
COPY deployment/argus_face_capture_patch.php /tmp/argus_face_capture_patch.php
COPY deployment/face_capture_test.php /var/www/html/tests/face_capture_test.php
RUN php -l /var/www/html/src/FaceCapture.php \
 && php -l /var/www/html/src/KycStudio.php \
 && php -l /tmp/argus_face_capture_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_face_capture_patch.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /var/www/html/tests/face_capture_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/face_capture_test.php


# ARGUS defense in depth. Run after all legacy unit tests:
# - strict browser/privacy headers and no sensitive cache
# - hashed atomic request velocity / intrusion evidence (no PII in rate keys)
# - seller authorization consistency, deposit/withdrawal throttling
# - no cross-use of MisticPay Finance secrets for traditional Pix charges
COPY deployment/SecurityShield.php /var/www/html/src/SecurityShield.php
COPY deployment/argus_security_patch.php /tmp/argus_security_patch.php
COPY deployment/security_regression_test.php /var/www/html/tests/security_regression_test.php
COPY deployment/argus-security.conf /etc/apache2/conf-available/argus-security.conf
RUN php -l /var/www/html/src/SecurityShield.php \
 && php -l /tmp/argus_security_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_security_patch.php \
 && a2enconf argus-security \
 && apache2ctl configtest \
 && php -l /var/www/html/src/Portal.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /var/www/html/tests/security_regression_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/security_regression_test.php


# ARGUS responsive visual consistency across admin, wallet, KYC, Pix, API
# docs and PWA installation; no changes to financial or identity endpoints.
COPY deployment/layout-quality.css deployment/layout-quality.js /var/www/html/public/static/
COPY deployment/layout_install_patch.php /tmp/layout_install_patch.php
COPY deployment/layout_quality_test.php /var/www/html/tests/layout_quality_test.php
RUN php -l /tmp/layout_install_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/layout_install_patch.php \
 && php -l /var/www/html/tests/layout_quality_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/layout_quality_test.php


# Public ARGUS Pay marketing site. New homepage and safe aliases; the existing
# /admin, /conta and /api paths, money accounting, keys and KYC stay unchanged.
# Independent HTML/CSS/JS means the page works even before customer login.
COPY deployment/landing.html deployment/landing.css deployment/landing.js /var/www/html/public/static/
COPY deployment/landing_route_patch.php /tmp/landing_route_patch.php
COPY deployment/landing_test.php /var/www/html/tests/landing_test.php
RUN php -l /tmp/landing_route_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/landing_route_patch.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /var/www/html/tests/landing_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/landing_test.php \
 && apache2ctl configtest


# Safari registration / customer account polish from real mobile screenshots:
# compact accessible menu, no sticky overlay, correct checkbox geometry,
# KYC and account details before finance forms, hide unauthorized actions.
# Added AFTER all original payment/KYC tests, and after landing signup patch.
COPY deployment/client-mobile-fix.css deployment/client-mobile-fix.js /var/www/html/public/static/
COPY deployment/client_mobile_layout_patch.php /tmp/client_mobile_layout_patch.php
COPY deployment/client_mobile_layout_test.php /var/www/html/tests/client_mobile_layout_test.php
RUN php -l /tmp/client_mobile_layout_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/client_mobile_layout_patch.php \
 && php -l /var/www/html/tests/client_mobile_layout_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/client_mobile_layout_test.php


# Root-cause fix for Safari /cadastro still showing a 4-row sticky header.
# Server-render the native <details> menu and mark /cadastro and /cliente as
# no-store. No JavaScript dependency to collapse the navigation.
COPY deployment/client-native-menu.css /var/www/html/public/static/client-native-menu.css
COPY deployment/client_native_menu_patch.php /tmp/client_native_menu_patch.php
COPY deployment/client_native_menu_test.php /var/www/html/tests/client_native_menu_test.php
RUN php -l /tmp/client_native_menu_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/client_native_menu_patch.php \
 && php -l /var/www/html/tests/client_native_menu_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/client_native_menu_test.php \
 && apache2ctl configtest


# Screenshot/video regression: iPhone Safari must never show the guest login
# underneath or instead of an authenticated account during an in-flight read.
# Install AFTER all other PHP, auth, KYC, navigation and layout modifications.
COPY deployment/portal_session_stability_patch.php /tmp/portal_session_stability_patch.php
COPY deployment/portal_session_stability_test.php /var/www/html/tests/portal_session_stability_test.php
RUN php -l /tmp/portal_session_stability_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/portal_session_stability_patch.php \
 && php -l /var/www/html/tests/portal_session_stability_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/portal_session_stability_test.php


# Admin-style reseller workspace. Reuse existing DOM components with handlers,
# permissions and finance guards intact; visitor login is unaffected.
COPY deployment/reseller-dashboard.js deployment/reseller-dashboard.css /var/www/html/public/static/
COPY deployment/reseller_dashboard_patch.php /tmp/reseller_dashboard_patch.php
COPY deployment/reseller_dashboard_test.php /var/www/html/tests/reseller_dashboard_test.php
RUN php -l /tmp/reseller_dashboard_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/reseller_dashboard_patch.php \
 && php -l /var/www/html/tests/reseller_dashboard_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/reseller_dashboard_test.php


# Super Admin Central KYC usability: keep the identity dossier closed until
# the reviewer selects a seller's card. Clicking the selected card closes it.
# Preserve protected document retrieval and all KYC/financial permissions.
COPY deployment/kyc_dossier_click_patch.php /tmp/kyc_dossier_click_patch.php
COPY deployment/kyc_dossier_click_test.php /var/www/html/tests/kyc_dossier_click_test.php
RUN php -l /tmp/kyc_dossier_click_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/kyc_dossier_click_patch.php \
 && php -l /var/www/html/tests/kyc_dossier_click_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/kyc_dossier_click_test.php


# Admin-style reseller experience, real KYC status projection, brand startup
# and first-class public seller login. Run last, after security, full KYC,
# finance, session-stability and all prior UI regressions.
COPY deployment/reseller-admin-parity.css deployment/reseller-experience.js /var/www/html/public/static/
COPY deployment/reseller_admin_parity_patch.php /tmp/reseller_admin_parity_patch.php
COPY deployment/reseller_admin_parity_test.php /var/www/html/tests/reseller_admin_parity_test.php
RUN php -l /tmp/reseller_admin_parity_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/reseller_admin_parity_patch.php \
 && php -l /var/www/html/src/KycStudio.php \
 && php -l /var/www/html/tests/reseller_admin_parity_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/reseller_admin_parity_test.php \
 && apache2ctl configtest


# Super Admin finance eligibility should be visible for PF and PJ. PF receives
# an explicit homologation notice: no hidden activation, no fake authorization.
# Existing KYC/PJ activation and PSP safeguards remain untouched.
COPY deployment/kyc_finance_visibility_patch.php /tmp/kyc_finance_visibility_patch.php
COPY deployment/kyc_finance_visibility_test.php /var/www/html/tests/kyc_finance_visibility_test.php
RUN php -l /tmp/kyc_finance_visibility_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/kyc_finance_visibility_patch.php \
 && php -l /var/www/html/tests/kyc_finance_visibility_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/kyc_finance_visibility_test.php


# CPF financial activation with audited, 2FA-protected Super Admin approval.
# Each PF has an independent merchant_id: NEVER reuse a CNPJ / b2b merchant.
# External money operations continue gated by PSP custody + ledger safeguards.
# All prior KYC and funds tests run before this final, isolated extension.
COPY deployment/PfFinancialApproval.php /var/www/html/src/PfFinancialApproval.php
COPY deployment/pf_financial_activation_patch.php /tmp/pf_financial_activation_patch.php
COPY deployment/pf_financial_activation_test.php /var/www/html/tests/pf_financial_activation_test.php
RUN php -l /var/www/html/src/PfFinancialApproval.php \
 && php -l /tmp/pf_financial_activation_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/pf_financial_activation_patch.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /var/www/html/src/Portal.php \
 && php -l /var/www/html/src/Admin.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && php -l /var/www/html/tests/pf_financial_activation_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/pf_financial_activation_test.php \
 && apache2ctl configtest

# ARGUS read-only paid Pix revenue: all sellers for the Super Admin, own paid
# Pix ledger only for each reseller, with refund dates and fair period deltas.
# Mounted LAST so no finance or CPF approval flows are altered.
COPY deployment/RevenueReport.php /var/www/html/src/RevenueReport.php
COPY deployment/revenue-dashboard.js deployment/revenue-dashboard.css /var/www/html/public/static/
COPY deployment/revenue_report_patch.php /tmp/revenue_report_patch.php
COPY deployment/revenue_report_test.php /var/www/html/tests/revenue_report_test.php
RUN php -l /var/www/html/src/RevenueReport.php \
 && php -l /tmp/revenue_report_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/revenue_report_patch.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && php -l /var/www/html/tests/revenue_report_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/revenue_report_test.php \
 && apache2ctl configtest

# Reseller entry and registration: visually mirror Super Admin while retaining
# all original account session, CPF/CNPJ validation and KYC safeguards.
# Install after the seller workspace, revenue and security test suite.
COPY deployment/reseller-entry-admin.css deployment/reseller-entry-admin.js /var/www/html/public/static/
COPY deployment/reseller_entry_admin_patch.php /tmp/reseller_entry_admin_patch.php
COPY deployment/reseller_entry_admin_test.php /var/www/html/tests/reseller_entry_admin_test.php
RUN php -l /tmp/reseller_entry_admin_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/reseller_entry_admin_patch.php \
 && php -l /var/www/html/tests/reseller_entry_admin_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/reseller_entry_admin_test.php \
 && apache2ctl configtest

# Email-verified password recovery: random one-time links, finite token expiry,
# owner-only password change and revocation of old portal sessions.
# Resend email transport remains DISABLED until verified credentials configured.
COPY deployment/PortalPasswordReset.php /var/www/html/src/PortalPasswordReset.php
COPY deployment/reseller-password-recovery.js deployment/reseller-password-recovery.css /var/www/html/public/static/
COPY deployment/password_recovery_patch.php /tmp/password_recovery_patch.php
COPY deployment/password_recovery_test.php /var/www/html/tests/password_recovery_test.php
RUN php -l /var/www/html/src/PortalPasswordReset.php \
 && php -l /tmp/password_recovery_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/password_recovery_patch.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /var/www/html/src/Portal.php \
 && php -l /var/www/html/tests/password_recovery_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/password_recovery_test.php \
 && apache2ctl configtest

# Read-only financial operations: scoped book exports + cross-check wallet balances
# against immutable ledger and highlight stale/uncertain Pix and payouts.
COPY deployment/FinanceOperations.php /var/www/html/src/FinanceOperations.php
COPY deployment/finance-operations.js deployment/finance-operations.css /var/www/html/public/static/
COPY deployment/finance_operations_patch.php /tmp/finance_operations_patch.php
COPY deployment/finance_operations_test.php /var/www/html/tests/finance_operations_test.php
RUN php -l /var/www/html/src/FinanceOperations.php \
 && php -l /tmp/finance_operations_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/finance_operations_patch.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && php -l /var/www/html/tests/finance_operations_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/finance_operations_test.php \
 && apache2ctl configtest

# Secure merchant outbound HMAC notifications: one-time sealed keys, strict HTTPS
# public DNS verification with pinned TLS, bounded retry & tenant-only history.
# Actual delivery is disabled until explicitly enabled in the private worker.
COPY deployment/MerchantWebhooks.php /var/www/html/src/MerchantWebhooks.php
COPY deployment/merchant-webhooks.js deployment/merchant-webhooks.css deployment/merchant-webhooks-docs.js /var/www/html/public/static/
COPY deployment/merchant_webhooks_patch.php /tmp/merchant_webhooks_patch.php
COPY deployment/merchant_webhooks_test.php /var/www/html/tests/merchant_webhooks_test.php
RUN php -l /var/www/html/src/MerchantWebhooks.php \
 && php -l /tmp/merchant_webhooks_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/merchant_webhooks_patch.php \
 && php -l /var/www/html/src/Portal.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /usr/local/share/argus/notify_worker.php \
 && php -l /var/www/html/tests/merchant_webhooks_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/merchant_webhooks_test.php \
 && apache2ctl configtest

# Independent financial controls: never abandon unresolved Pix by age, keep
# ledger-checked payouts exactly-once, and lock background cycles per database.
# Actual independent scheduling requires a separate Render Cron with persistent DB.
COPY deployment/FinancialControl.php /var/www/html/src/FinancialControl.php
COPY deployment/financial_safety_patch.php /tmp/financial_safety_patch.php
COPY deployment/financial_safety_test.php /var/www/html/tests/financial_safety_test.php
RUN php -l /var/www/html/src/FinancialControl.php \
 && php -l /tmp/financial_safety_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/financial_safety_patch.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && php -l /var/www/html/src/TraditionalQuickPix.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /usr/local/share/argus/notify_worker.php \
 && php -l /var/www/html/tests/financial_safety_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/financial_safety_test.php \
 && apache2ctl configtest

ENV ARGUS_DB_DRIVER=sqlite ARGUS_COOKIE_SECURE=true ARGUS_MISTICPAY_MODE=disabled
EXPOSE 10000
CMD ["/bin/bash", "-c", "php /usr/local/share/argus/storage_probe.php; if [ \"${ARGUS_NOTIFICATIONS_WORKER_ENABLED:-no}\" = \"yes\" ]; then (while true; do timeout 45 php /usr/local/share/argus/notify_worker.php || true; sleep 90; done) & fi; exec /bin/bash /var/www/html/start-render.sh"]

# Original ARGUS logo uploaded by owner; serve unchanged for password reset emails.
COPY deployment/86C80C78-3DA4-438C-9215-C0A0C3EAEF14.png /var/www/html/public/static/assets/argus-logo-email-original.png
