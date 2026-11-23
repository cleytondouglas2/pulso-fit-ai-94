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
# seller and admin password changes, and revocation of old sessions.
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
 && php -l /var/www/html/src/Admin.php \
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
CMD ["/bin/bash", "-c", "php /usr/local/share/argus/storage_probe.php; if [ \"${ARGUS_NOTIFICATIONS_WORKER_ENABLED:-no}\" = \"yes\" ]; then (while true; do timeout 45 php /usr/local/share/argus/notify_worker.php || true; sleep 25; done) & fi; exec /bin/bash /var/www/html/start-render.sh"]

# Original ARGUS logo uploaded by owner; serve unchanged for password reset emails.
COPY deployment/86C80C78-3DA4-438C-9215-C0A0C3EAEF14.png /var/www/html/public/static/assets/argus-logo-email-original.png

# Refresh the reseller assets after the build-time tests for both hostnames.
RUN sed -i 's#reseller-admin-parity.css?v=20261119-5#reseller-admin-parity.css?v=reseller-layout-20261120-1#; \
 s#reseller-dashboard.js?v=admin-v1-20261119#reseller-dashboard.js?v=reseller-layout-20261120-1#; \
 s#merchant-portal.js?v=status-20261119-5#merchant-portal.js?v=seller-pix-modal-20261120-1#; \
 s#/static/portal.js?v=status-20261119-5#/static/portal.js?v=reseller-layout-20261120-1#; \
 s#merchant-webhooks.js?v=20261119-1#merchant-webhooks.js?v=reseller-layout-20261120-1#; \
 s#merchant-portal.css?v=3#merchant-portal.css?v=seller-pix-modal-20261120-1"><link rel="stylesheet" href="/static/quick-pix-popup.css?v=2#; \
 s#revenue-dashboard.css?v=20261119-1#revenue-dashboard.css?v=workspace-20261120-4#; \
 s#revenue-dashboard.js?v=20261119-1#revenue-dashboard.js?v=workspace-20261120-4#' /var/www/html/public/static/client.html \
 && sed -i 's#revenue-dashboard.css?v=20261119-1#revenue-dashboard.css?v=workspace-20261120-4#; \
 s#revenue-dashboard.js?v=20261119-1#revenue-dashboard.js?v=workspace-20261120-4#' /var/www/html/public/static/admin.html \
 && test "$(grep -o 'v=reseller-layout-20261120-1' /var/www/html/public/static/client.html | wc -l)" -eq 4 \
 && grep -Fq "merchant-portal.js?v=seller-pix-modal-20261120-1" /var/www/html/public/static/client.html


# ARGUS HYBRID PAYOUTS — staged by default, no real PSP transfer during build.
# Gate 1: existing ARGUS_PAYOUTS_ENABLED=yes (homologated custodial money path).
# Gate 2: new ARGUS_HYBRID_PAYOUT_LIVE=yes (explicit rollout; default OFF).
# Low-risk requests remain REVIEW until both gates are enabled. High-risk
# requests require OTP-protected Super Admin approval. All tests synthetic.
COPY deployment/HybridPayout.php /var/www/html/src/HybridPayout.php
COPY deployment/hybrid-payout.js deployment/hybrid-payout.css /var/www/html/public/static/
COPY deployment/hybrid_payout_patch.php /tmp/hybrid_payout_patch.php
COPY deployment/hybrid_payout_test.php /var/www/html/tests/hybrid_payout_test.php
RUN php -l /var/www/html/src/HybridPayout.php \
 && php -l /tmp/hybrid_payout_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/hybrid_payout_patch.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /var/www/html/src/FinancialControl.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && php -l /var/www/html/src/Admin.php \
 && php -l /var/www/html/tests/hybrid_payout_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/hybrid_payout_test.php \
 && php /var/www/html/tests/ui_contract.php \
 && apache2ctl configtest


# ARGUS Chat payout: authenticated merchant wizard, explicitly confirmed, no model
# payment authority. Existing MisticPay / wallet / hybrid-review code stays intact.
COPY deployment/chat-payout.js deployment/chat-payout.css /var/www/html/public/static/
COPY deployment/chat_payout_patch.php /tmp/chat_payout_patch.php
COPY deployment/chat_payout_test.php /var/www/html/tests/chat_payout_test.php
RUN php -l /tmp/chat_payout_patch.php \
 && php -l /var/www/html/tests/chat_payout_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/chat_payout_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/chat_payout_test.php \
 && php /var/www/html/tests/ui_contract.php \
 && apache2ctl configtest


# ARGUS API V2 returns a self-contained QR PNG for authenticated merchant Pix.
# QR generation is local to the gateway (no third-party QR API and no new Pix).
# Install as the LAST image step so legacy finance and security patches remain.
RUN apt-get update \
 && apt-get install -y --no-install-recommends qrencode \
 && rm -rf /var/lib/apt/lists/*
COPY deployment/ArgusPixQr.php /var/www/html/src/ArgusPixQr.php
COPY deployment/argus_pix_qr_api_patch.php /tmp/argus_pix_qr_api_patch.php
COPY deployment/argus_pix_qr_api_test.php /var/www/html/tests/argus_pix_qr_api_test.php
RUN php -l /var/www/html/src/ArgusPixQr.php \
 && php -l /tmp/argus_pix_qr_api_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_pix_qr_api_patch.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && php -l /var/www/html/tests/argus_pix_qr_api_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/argus_pix_qr_api_test.php \
 && php /var/www/html/tests/finance_operations_test.php \
 && apache2ctl configtest


# Pix seller UX enhancement: no change to gateway, ledger or payment endpoints.
COPY deployment/reseller-pix-ui.js deployment/reseller-pix-ui.css /var/www/html/public/static/
RUN sed -i 's#</head>#<link rel="stylesheet" href="/static/reseller-pix-ui.css?v=20261122-1"><script defer src="/static/reseller-pix-ui.js?v=20261122-1"></script></head>#' /var/www/html/public/static/client.html \
 && grep -Fq 'reseller-pix-ui.js?v=20261122-1' /var/www/html/public/static/client.html

# Seller Pix submission: update the compiled UI after strict legacy payment and KYC tests.
COPY deployment/seller_pix_submit_patch.php /tmp/seller_pix_submit_patch.php
RUN php -l /tmp/seller_pix_submit_patch.php \
 && php -d display_errors=1 -d log_errors=0 /tmp/seller_pix_submit_patch.php \
 && grep -Fq 'sellerChargeBusy=false' /var/www/html/public/static/merchant-portal.js \
 && sed -i 's#reseller-pix-ui.js?v=20261122-1#reseller-pix-ui.js?v=20261122-2#; s#reseller-pix-ui.css?v=20261122-1#reseller-pix-ui.css?v=20261122-2#; s#merchant-portal.js?v=seller-pix-modal-20261120-1#merchant-portal.js?v=seller-submit-20261122-2#' /var/www/html/public/static/client.html \
 && grep -Fq 'reseller-pix-ui.js?v=20261122-2' /var/www/html/public/static/client.html \
 && grep -Fq 'merchant-portal.js?v=seller-submit-20261122-2' /var/www/html/public/static/client.html

# Responsive reseller SPA: reduce redundant work and parallelize read-only GETs.
# Installed AFTER all ledger, Pix, KYC, and previous release regression tests.
COPY deployment/reseller_perf_patch.php /tmp/reseller_perf_patch.php
RUN php -l /tmp/reseller_perf_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/reseller_perf_patch.php \
 && grep -Fq 'structuralSelector=' /var/www/html/public/static/reseller-dashboard.js \
 && grep -Fq 'sessionResult,keysResult,activityResult' /var/www/html/public/static/merchant-portal.js \
 && sed -i 's#reseller-dashboard.js?v=reseller-layout-20261120-1#reseller-dashboard.js?v=nav-speed-20261122-1#; s#merchant-portal.js?v=seller-submit-20261122-2#merchant-portal.js?v=nav-speed-20261122-1#; s#revenue-dashboard.js?v=workspace-20261120-4#revenue-dashboard.js?v=nav-speed-20261122-1#' /var/www/html/public/static/client.html \
 && grep -Fq 'reseller-dashboard.js?v=nav-speed-20261122-1' /var/www/html/public/static/client.html \
 && grep -Fq 'merchant-portal.js?v=nav-speed-20261122-1' /var/www/html/public/static/client.html


# Premium ARGUS Pay reseller balance cards, presentation-only; values stay API sourced.
COPY deployment/reseller-premium-wallet.css /var/www/html/public/static/reseller-premium-wallet.css
RUN sed -i 's#</head>#<link rel="stylesheet" href="/static/reseller-premium-wallet.css?v=20261122-premium-1"></head>#' /var/www/html/public/static/client.html \
 && test -s /var/www/html/public/static/reseller-premium-wallet.css \
 && grep -Fq '/static/reseller-premium-wallet.css?v=20261122-premium-1' /var/www/html/public/static/client.html \
 && grep -Fq 'id="res-welcome"' /var/www/html/public/static/reseller-dashboard.js \
 && grep -Fq 'id="seller-balances"' /var/www/html/public/static/merchant-portal.js

# Seller-page resilience, independent of legacy finance handlers and KYC patches.
COPY deployment/reseller-ui-stability.js deployment/reseller-ui-stability.css /var/www/html/public/static/
RUN test -s /var/www/html/public/static/reseller-ui-stability.js \
 && sed -i 's#</head>#<link rel="stylesheet" href="/static/reseller-ui-stability.css?v=20261122-3"><script defer src="/static/reseller-ui-stability.js?v=20261122-3"></script></head>#' /var/www/html/public/static/client.html \
 && grep -Fq '/static/reseller-ui-stability.js?v=20261122-3' /var/www/html/public/static/client.html \
 && grep -Fq 'id="res-charge-form"' /var/www/html/public/static/reseller-dashboard.js \
 && grep -Fq 'id="seller-deposit-form"' /var/www/html/public/static/merchant-portal.js


# Single branded wallet card on seller overview, with live API values untouched.
COPY deployment/reseller-unified-card.css /var/www/html/public/static/reseller-unified-card.css
RUN test -s /var/www/html/public/static/reseller-unified-card.css \
 && grep -Fq 'id="seller-balances"' /var/www/html/public/static/merchant-portal.js \
 && grep -Fq 'id="argus-reseller-overview-balances"' /var/www/html/public/static/reseller-dashboard.js \
 && sed -i 's#</head>#<link rel="stylesheet" href="/static/reseller-unified-card.css?v=20261122-card-1"></head>#' /var/www/html/public/static/client.html \
 && grep -Fq '/static/reseller-unified-card.css?v=20261122-card-1' /var/www/html/public/static/client.html


# REFRESH: Match original ARGUS Pay premium three-card mockup: compact width,
# separate main gold card + two secondary cards, instead of one wide frame.
RUN sed -i 's#reseller-unified-card.css?v=20261122-card-1#reseller-unified-card.css?v=20261122-card-2#' /var/www/html/public/static/client.html \
 && grep -Fq 'reseller-unified-card.css?v=20261122-card-2' /var/www/html/public/static/client.html


# Argus IA mythology/financial chat polish, existing AI and payout auth unchanged.
# Static presentation only; never sends money in build tests.
COPY deployment/ai-conversation-experience.js deployment/ai-conversation-experience.css /var/www/html/public/static/
RUN php -l /var/www/html/src/AI.php \
 && php -d display_errors=1 -d log_errors=0 /var/www/html/tests/ai_test.php \
 && php -d display_errors=1 -d log_errors=0 /var/www/html/tests/chat_payout_test.php \
 && test -s /var/www/html/public/static/ai-conversation-experience.js \
 && test -s /var/www/html/public/static/ai-conversation-experience.css \
 && sed -i 's#</head>#<link rel="stylesheet" href="/static/ai-conversation-experience.css?v=20261122-1"></head>#; s#</body>#<script defer src="/static/ai-conversation-experience.js?v=20261122-1"></script></body>#' /var/www/html/public/static/client.html \
 && sed -i 's#</head>#<link rel="stylesheet" href="/static/ai-conversation-experience.css?v=20261122-1"></head>#; s#</body>#<script defer src="/static/ai-conversation-experience.js?v=20261122-1"></script></body>#' /var/www/html/public/static/admin.html \
 && grep -Fq 'ai-conversation-experience.js?v=20261122-1' /var/www/html/public/static/client.html \
 && grep -Fq 'ai-conversation-experience.js?v=20261122-1' /var/www/html/public/static/admin.html \
 && grep -Fq 'chat-payout.js?v=20261120-1' /var/www/html/public/static/client.html


# ARGUS reseller Aurum: comprehensive production UI refresh only.
# Runs after finance, access control, payouts, KYC, and AI regression tests.
COPY deployment/reseller-aurum-experience.css /var/www/html/public/static/reseller-aurum-experience.css
RUN test -s /var/www/html/public/static/reseller-aurum-experience.css \
 && grep -Fq "page('statement'" /var/www/html/public/static/reseller-dashboard.js \
 && grep -Fq 'id="seller-withdraw-form"' /var/www/html/public/static/merchant-portal.js \
 && grep -Fq 'id="seller-deposit-form"' /var/www/html/public/static/merchant-portal.js \
 && sed -i 's#</head>#<link rel="stylesheet" href="/static/reseller-aurum-experience.css?v=20261122-ui1"></head>#' /var/www/html/public/static/client.html \
 && grep -Fq '/static/reseller-aurum-experience.css?v=20261122-ui1' /var/www/html/public/static/client.html \
 && php /var/www/html/tests/ui_contract.php \
 && php /var/www/html/tests/finance_operations_test.php


# Fix filtered charge visibility and Safari date-control overlap.
# This is strictly UI; financial transactions, settlement and ledger are unchanged.
COPY deployment/reseller_filter_layout_test.php /var/www/html/tests/reseller_filter_layout_test.php
RUN php -l /var/www/html/tests/reseller_filter_layout_test.php \
 && php /var/www/html/tests/reseller_filter_layout_test.php \
 && sed -i 's#reseller-dashboard.js?v=nav-speed-20261122-1#reseller-dashboard.js?v=filter-visible-20261122-2#; s#reseller-aurum-experience.css?v=20261122-ui1#reseller-aurum-experience.css?v=20261122-ui2#' /var/www/html/public/static/client.html \
 && grep -Fq 'reseller-dashboard.js?v=filter-visible-20261122-2' /var/www/html/public/static/client.html \
 && grep -Fq 'reseller-aurum-experience.css?v=20261122-ui2' /var/www/html/public/static/client.html \
 && php /var/www/html/tests/ui_contract.php


# iPhone Safari statement layout: native calendars in clipped bordered shells.
# Preserve the original export event, dates and tenant-scoped CSV endpoint.
COPY deployment/reseller-statement-boundary.css /var/www/html/public/static/reseller-statement-boundary.css
COPY deployment/reseller_statement_boundary_test.php /var/www/html/tests/reseller_statement_boundary_test.php
RUN php -l /var/www/html/tests/reseller_statement_boundary_test.php \
 && php /var/www/html/tests/finance_operations_test.php \
 && php /var/www/html/tests/ui_contract.php \
 && sed -i 's#</head>#<link rel="stylesheet" href="/static/reseller-statement-boundary.css?v=20261122-3"></head>#; s#finance-operations.js?v=20261119-1#finance-operations.js?v=20261122-boundary-1#' /var/www/html/public/static/client.html \
 && php /var/www/html/tests/reseller_statement_boundary_test.php


# Permit password recovery from exact ArgusPay Render service URLs, never arbitrary origins.
COPY deployment/password_reset_origin_test.php /var/www/html/tests/password_reset_origin_test.php
RUN php -l /var/www/html/src/PortalPasswordReset.php \
 && php -l /var/www/html/tests/password_reset_origin_test.php \
 && php /var/www/html/tests/password_reset_origin_test.php \
 && php /var/www/html/tests/password_recovery_test.php \
 && php /var/www/html/tests/security_regression_test.php


# Post-build ARGUS security hardening. Successful charge/payout flows remain unchanged.
COPY deployment/SecurityShield.php /var/www/html/src/SecurityShield.php
COPY deployment/api_auth_hardening_patch.php /tmp/api_auth_hardening_patch.php
COPY deployment/api_auth_hardening_test.php /var/www/html/tests/api_auth_hardening_test.php
RUN php -l /var/www/html/src/SecurityShield.php \
 && php -l /tmp/api_auth_hardening_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/api_auth_hardening_patch.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && php -l /var/www/html/src/Portal.php \
 && php -l /var/www/html/src/PortalPasswordReset.php \
 && php /var/www/html/tests/api_auth_hardening_test.php \
 && php /var/www/html/tests/security_regression_test.php \
 && php /var/www/html/tests/password_recovery_test.php \
 && ARGUS_SECURITY_RATE_SECRET=TEST_ONLY_64_CHARACTER_SECRET_FOR_ISOLATED_AUTH_TESTS_1234567890123456 php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/seller_key_auth_integration_test.php


# Seller financial MFA (TOTP) for browser/chat withdrawals and payout-capable keys.
# No real transfers in any test. Existing API integrations continue with their
# explicitly scoped keys; new payout-capable keys require step-up authorization.
COPY deployment/SellerMfa.php /var/www/html/src/SellerMfa.php
COPY deployment/seller_mfa_patch.php /tmp/seller_mfa_patch.php
COPY deployment/seller_mfa.js deployment/seller_mfa.css /var/www/html/public/static/
COPY deployment/seller_mfa_test.php /var/www/html/tests/seller_mfa_test.php
RUN php -l /var/www/html/src/SellerMfa.php \
 && php -l /tmp/seller_mfa_patch.php \
 && php /tmp/seller_mfa_patch.php \
 && php -l /var/www/html/src/Portal.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && sed -i 's#</head>#<link rel="stylesheet" href="/static/seller_mfa.css?v=20261122-1"></head>#; s#</body>#<script defer src="/static/seller_mfa.js?v=20261122-1"></script></body>#' /var/www/html/public/static/client.html \
 && php /var/www/html/tests/seller_mfa_test.php \
 && php /var/www/html/tests/security_regression_test.php


# Privacy-safe login anomaly detection, account history, and optional email
# alerts (only if the configured Resend account works). Never blocks login.
COPY deployment/SellerAccessAudit.php /var/www/html/src/SellerAccessAudit.php
COPY deployment/seller_access_audit_patch.php /tmp/seller_access_audit_patch.php
COPY deployment/seller_access_audit.js deployment/seller_access_audit.css /var/www/html/public/static/
COPY deployment/seller_access_audit_test.php /var/www/html/tests/seller_access_audit_test.php
RUN php -l /var/www/html/src/SellerAccessAudit.php \
 && php -l /tmp/seller_access_audit_patch.php \
 && php /tmp/seller_access_audit_patch.php \
 && php -l /var/www/html/src/Portal.php \
 && sed -i 's#</head>#<link rel="stylesheet" href="/static/seller_access_audit.css?v=20261122-1"></head>#; s#</body>#<script defer src="/static/seller_access_audit.js?v=20261122-1"></script></body>#' /var/www/html/public/static/client.html \
 && php /var/www/html/tests/seller_access_audit_test.php \
 && php /var/www/html/tests/password_recovery_test.php \
 && php /var/www/html/tests/security_regression_test.php


# ARGUS reseller: ask TOTP only AFTER tapping "Solicitar saque".
# Accessible branded modal; no financial requests in the modal itself.
COPY deployment/seller_withdraw_modal_patch.php /tmp/seller_withdraw_modal_patch.php
COPY deployment/seller_withdraw_modal_test.php /var/www/html/tests/seller_withdraw_modal_test.php
RUN php -l /tmp/seller_withdraw_modal_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/seller_withdraw_modal_patch.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && php /var/www/html/tests/seller_withdraw_modal_test.php \
 && php /var/www/html/tests/seller_mfa_test.php \
 && php /var/www/html/tests/security_regression_test.php


# Safari/iOS progressive Brazilian-real mask on seller withdrawal amount only.
# No changes to Pix provider, wallet, limits, idempotency or MFA confirmation.
COPY deployment/seller_withdraw_money_mask_patch.php /tmp/seller_withdraw_money_mask_patch.php
COPY deployment/seller_withdraw_money_mask_test.php /var/www/html/tests/seller_withdraw_money_mask_test.php
RUN php -l /tmp/seller_withdraw_money_mask_patch.php \
 && php /var/www/html/tests/seller_withdraw_modal_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/seller_withdraw_money_mask_patch.php \
 && php /var/www/html/tests/seller_withdraw_money_mask_test.php \
 && php /var/www/html/tests/seller_mfa_test.php \
 && php /var/www/html/tests/security_regression_test.php



# ARGUS Super Admin: post-submit TOTP in branded, responsive Pix confirmation.
# Must retain the quoted fee policy, existing superadmin security and provider API.
COPY deployment/admin-pix-stepup.js deployment/admin-pix-stepup.css /var/www/html/public/static/
COPY deployment/admin_payout_stepup_patch.php /tmp/admin_payout_stepup_patch.php
COPY deployment/admin_payout_stepup_test.php /var/www/html/tests/admin_payout_stepup_test.php
RUN php -l /tmp/admin_payout_stepup_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/admin_payout_stepup_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/admin_payout_stepup_test.php \
 && php /var/www/html/tests/security_2fa_unit.php \
 && php /var/www/html/tests/finance_qr_unit.php \
 && php /var/www/html/tests/security_regression_test.php


# Recognize every commercially collected seller ARGUS fee as revenue of the
# verified owner email, ONLY after a confirmed PSP paid result. Never send a
# second Pix: a bank transfer to that owner needs independent, verified payout.
COPY deployment/PlatformFeeTreasury.php /var/www/html/src/PlatformFeeTreasury.php
COPY deployment/admin-platform-fees.js deployment/admin-platform-fees.css /var/www/html/public/static/
COPY deployment/platform_fee_treasury_patch.php /tmp/platform_fee_treasury_patch.php
COPY deployment/platform_fee_treasury_test.php /var/www/html/tests/platform_fee_treasury_test.php
RUN php -l /var/www/html/src/PlatformFeeTreasury.php \
 && php -l /tmp/platform_fee_treasury_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/platform_fee_treasury_patch.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/platform_fee_treasury_test.php \
 && php /var/www/html/tests/hybrid_payout_test.php \
 && php /var/www/html/tests/security_regression_test.php


# Immutable seller fee split: the existing Super Admin rates are the source
# for all new seller Pix charges and withdrawals. Provider cost is provisional,
# ARGUS commercial share is recognized only after PSP-paid reconciliation.
# Never send an extra Pix for accounting. No live PSP calls during tests.
COPY deployment/SellerFeeSplit.php /var/www/html/src/SellerFeeSplit.php
COPY deployment/seller_fee_split_patch.php /tmp/seller_fee_split_patch.php
COPY deployment/seller_fee_split_test.php /var/www/html/tests/seller_fee_split_test.php
RUN php -l /var/www/html/src/SellerFeeSplit.php \
 && php -l /tmp/seller_fee_split_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/seller_fee_split_patch.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && php -l /var/www/html/src/PlatformFeeTreasury.php \
 && php -l /var/www/html/src/FeePolicy.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/seller_fee_split_test.php \
 && php /var/www/html/tests/hybrid_payout_test.php \
 && php /var/www/html/tests/security_regression_test.php


# Public /pix self-service checkout to the verified ARGUS Super Admin only.
# Uses the already configured MisticPay traditional cash-in credentials on
# the SERVER, payer's own identity and admin-configured PSP deposit cost.
# The new checkout never opens private admin APIs and cannot request a payout.
COPY deployment/PublicAdminPix.php /var/www/html/src/PublicAdminPix.php
COPY deployment/public-pix.html deployment/public-pix.css deployment/public-pix.js /var/www/html/public/static/
COPY deployment/public_admin_pix_patch.php /tmp/public_admin_pix_patch.php
COPY deployment/public_admin_pix_test.php /var/www/html/tests/public_admin_pix_test.php
RUN php -l /var/www/html/src/PublicAdminPix.php \
 && php -l /tmp/public_admin_pix_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/public_admin_pix_patch.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /var/www/html/src/TraditionalQuickPix.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/public_admin_pix_test.php \
 && php /var/www/html/tests/security_regression_test.php


# ARGUS public /pix premium receipt and accelerated independent verification.
# Continue provider-verified reconciliation after the 30-minute QR presentation
# window; keep existing money/idempotency boundaries and tenant separation.
COPY deployment/public_pix_watch_patch.php /tmp/public_pix_watch_patch.php
COPY deployment/public_pix_premium_test.php /var/www/html/tests/public_pix_premium_test.php
COPY Dockerfile /tmp/argus_premium_Dockerfile
RUN php -l /tmp/public_pix_watch_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/public_pix_watch_patch.php \
 && php -l /var/www/html/src/TraditionalQuickPix.php \
 && php -l /var/www/html/src/PublicAdminPix.php \
 && php /var/www/html/tests/public_pix_premium_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/security_regression_test.php


# Super Admin treasury /admin Pix withdrawal:
# progressive BRL masking while typing, exact integer-cent payload, iPhone
# keypad and cache bust. This only changes frontend presentation/parsing.
# Keep existing quote, TOTP step-up, backend limits and idempotency untouched.
COPY deployment/admin-withdraw-money.js deployment/admin-withdraw-money.css /var/www/html/public/static/
COPY deployment/admin_withdraw_money_patch.php /tmp/admin_withdraw_money_patch.php
COPY deployment/admin_withdraw_money_test.php /var/www/html/tests/admin_withdraw_money_test.php
RUN php -l /tmp/admin_withdraw_money_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/admin_withdraw_money_patch.php \
 && php -l /var/www/html/src/Admin.php \
 && php -l /var/www/html/tests/admin_withdraw_money_test.php \
 && php /var/www/html/tests/admin_withdraw_money_test.php \
 && php /var/www/html/tests/security_regression_test.php


# Super Admin's own treasury Pix withdrawal: NO ARGUS seller fee.
# Only current MisticPay contract cost is shown, not deducted twice.
# Keep server OTP, fee-policy version, idempotency, seller fee tables and
# historical settlement snapshots intact. Test locally; NEVER issue live Pix.
COPY deployment/admin_own_withdraw_fee_patch.php /tmp/admin_own_withdraw_fee_patch.php
COPY deployment/admin_own_withdraw_fee_test.php /var/www/html/tests/admin_own_withdraw_fee_test.php
RUN php -l /tmp/admin_own_withdraw_fee_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/admin_own_withdraw_fee_patch.php \
 && php -l /var/www/html/src/FeeExecution.php \
 && php -l /var/www/html/src/Admin.php \
 && php -l /var/www/html/tests/admin_own_withdraw_fee_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/admin_own_withdraw_fee_test.php \
 && php /var/www/html/tests/security_regression_test.php


# White-label the external ARGUS Pay checkout and reseller-facing messaging.
# Only customer-facing presentation/metadata; all PSP connections, fees,
# confirmation, private admin provider disclosures, and audit trails unchanged.
COPY deployment/argus_public_brand_patch.php /tmp/argus_public_brand_patch.php
COPY deployment/argus_public_brand_test.php /var/www/html/tests/argus_public_brand_test.php
RUN php -l /tmp/argus_public_brand_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_public_brand_patch.php \
 && php -l /var/www/html/src/PublicAdminPix.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && php -l /var/www/html/tests/argus_public_brand_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/argus_public_brand_test.php \
 && php /var/www/html/tests/security_regression_test.php


# Every seller: permanent non-enumerable /e/<unique-code> public ARGUS Pay Pix
# checkout, merchant-only wallet settlement and the admin-configured combined
# PSP+ARGUS service fee. Newly registered and preexisting sellers get links.
# No payout endpoint is accessible through /e or its receipt token.
COPY deployment/ResellerPublicPix.php /var/www/html/src/ResellerPublicPix.php
COPY deployment/reseller-public-pix.css deployment/reseller-public-link.css deployment/reseller-public-link.js /var/www/html/public/static/
COPY deployment/reseller_public_pix_patch.php /tmp/reseller_public_pix_patch.php
COPY deployment/reseller_public_pix_worker_patch.php /tmp/reseller_public_pix_worker_patch.php
COPY deployment/reseller_public_pix_test.php /var/www/html/tests/reseller_public_pix_test.php
RUN php -l /var/www/html/src/ResellerPublicPix.php \
 && php -l /tmp/reseller_public_pix_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/reseller_public_pix_patch.php \
 && php -l /tmp/reseller_public_pix_worker_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/reseller_public_pix_worker_patch.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /var/www/html/src/Portal.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && php -l /var/www/html/tests/reseller_public_pix_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/reseller_public_pix_test.php \
 && php /var/www/html/tests/security_regression_test.php


# Fix public Pix link card hidden behind legacy reseller HTML:
# Current /conta UI renders #argus-reseller-page-overview, so the CTA must
# be mounted inside that visible tab, directly after Nova cobrança Pix.
# This hotfix changes UI mounting only, no fees, balances or PSP requests.
COPY deployment/reseller-public-link.js deployment/reseller-public-link.css /var/www/html/public/static/
COPY deployment/reseller_public_overview_fix_patch.php /tmp/reseller_public_overview_fix_patch.php
COPY deployment/reseller_public_overview_fix_test.php /var/www/html/tests/reseller_public_overview_fix_test.php
RUN php -l /tmp/reseller_public_overview_fix_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/reseller_public_overview_fix_patch.php \
 && php -l /var/www/html/tests/reseller_public_overview_fix_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/reseller_public_overview_fix_test.php \
 && php /var/www/html/tests/security_regression_test.php


# Actual /conta Reseller Pix CTA hotfix:
# Bind click listeners against detached card nodes using root.querySelector
# rather than document.getElementById, which was null before insertion and
# aborted card mounting. Bump mobile Safari JS/CSS version.
COPY deployment/reseller-public-link.js /var/www/html/public/static/reseller-public-link.js
COPY deployment/reseller_public_link_dom_hotfix.php /tmp/reseller_public_link_dom_hotfix.php
COPY deployment/reseller_public_link_dom_test.php /var/www/html/tests/reseller_public_link_dom_test.php
RUN php -l /tmp/reseller_public_link_dom_hotfix.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/reseller_public_link_dom_hotfix.php \
 && php -l /var/www/html/tests/reseller_public_link_dom_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/reseller_public_link_dom_test.php \
 && php /var/www/html/tests/security_regression_test.php


# Public /e/{code} Pix readiness: use same approved PF/PJ wallet status as
# seller financial API, same custody gate, same traditional Pix credential
# fallback, and precise ARGUS Pay availability messages in checkout.
# No hardcoded enabled flag or bypass of financial authorization.
COPY deployment/ResellerPublicPix.php /var/www/html/src/ResellerPublicPix.php
COPY deployment/reseller_public_pix_readiness_patch.php /tmp/reseller_public_pix_readiness_patch.php
COPY deployment/reseller_public_pix_readiness_test.php /var/www/html/tests/reseller_public_pix_readiness_test.php
RUN php -l /var/www/html/src/ResellerPublicPix.php \
 && php -l /tmp/reseller_public_pix_readiness_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/reseller_public_pix_readiness_patch.php \
 && php -l /var/www/html/src/MerchantWallet.php \
 && php -l /var/www/html/tests/reseller_public_pix_readiness_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/reseller_public_pix_readiness_test.php \
 && php /var/www/html/tests/security_regression_test.php


# Fix actual 23:03 seller public Pix HTTP 500 before PSP submission:
# SecurityShield categories must use lowercase letters/underscores <= 40;
# a previous dynamic category embedded the 128-bit seller URL code.
# Keep HMAC-scoped limits, two windows, 2FA/money controls, fee snapshots.
COPY deployment/ResellerPublicPix.php /var/www/html/src/ResellerPublicPix.php
COPY deployment/reseller_pix_rate_guard_patch.php /tmp/reseller_pix_rate_guard_patch.php
COPY deployment/reseller_pix_rate_guard_test.php /var/www/html/tests/reseller_pix_rate_guard_test.php
RUN php -l /var/www/html/src/ResellerPublicPix.php \
 && php -l /tmp/reseller_pix_rate_guard_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/reseller_pix_rate_guard_patch.php \
 && php -l /var/www/html/tests/reseller_pix_rate_guard_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/reseller_pix_rate_guard_test.php \
 && php /var/www/html/tests/security_regression_test.php


# iOS/Safari public Pix modal safe-area hotfix for /pix and /e/{code}.
# The receipt dialog is full-viewport scrollable on mobile and always
# resets to the top; no payment/fee/account/PSP behavior is modified.
COPY deployment/pix-dialog-viewport.css /var/www/html/public/static/pix-dialog-viewport.css
COPY deployment/pix_dialog_safe_area_patch.php /tmp/pix_dialog_safe_area_patch.php
COPY deployment/pix_dialog_safe_area_test.php /var/www/html/tests/pix_dialog_safe_area_test.php
RUN php -l /tmp/pix_dialog_safe_area_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/pix_dialog_safe_area_patch.php \
 && php -l /var/www/html/tests/pix_dialog_safe_area_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/pix_dialog_safe_area_test.php \
 && php /var/www/html/tests/security_regression_test.php


# Super Admin initial overview: the same premium public Pix link card as the
# reseller screenshot, pointing ONLY to the existing /pix checkout on this host.
# UI-only: no new Pix, PSP requests, wallet movements, fee updates or payout.
COPY deployment/admin-public-link.js /var/www/html/public/static/admin-public-link.js
COPY deployment/admin_public_link_patch.php /tmp/admin_public_link_patch.php
COPY deployment/admin_public_link_test.php /var/www/html/tests/admin_public_link_test.php
RUN php -l /tmp/admin_public_link_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/admin_public_link_patch.php \
 && php -l /var/www/html/tests/admin_public_link_test.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /var/www/html/tests/admin_public_link_test.php \
 && php /var/www/html/tests/security_regression_test.php

# Brand supplied by account owner: exact full-square logo, opaque, no black/white
# side padding. Regenerate PNG app icons for Android PWA and iOS Safari Home Screen.
# Everything below is static presentation: NO PSP, fees, sessions or money changes.
COPY deployment/argus-home-art.webp.b64 /tmp/argus-home-art.webp.b64
RUN base64 -d /tmp/argus-home-art.webp.b64 >/tmp/argus-home-art.webp \
 && echo '9b63f1f90e4779c18af7ff124db9328a7e2daf7aca76a0cb768995f1d229446e  /tmp/argus-home-art.webp' | sha256sum -c - \
 && identify /tmp/argus-home-art.webp \
 && convert /tmp/argus-home-art.webp -resize 1024x1024! -alpha off -strip /var/www/html/public/static/assets/argus-brand-home-1024-v7.png \
 && convert /tmp/argus-home-art.webp -resize 512x512! -alpha off -strip /var/www/html/public/static/assets/argus-brand-home-512-v7.png \
 && convert /tmp/argus-home-art.webp -resize 192x192! -alpha off -strip /var/www/html/public/static/assets/argus-brand-home-192-v7.png \
 && convert /tmp/argus-home-art.webp -resize 180x180! -alpha off -strip /var/www/html/public/apple-touch-icon-argus-brand-20261123.png \
 && convert /tmp/argus-home-art.webp -resize 32x32! -alpha off -strip /var/www/html/public/static/assets/argus-brand-home-32-v7.png \
 && cp /var/www/html/public/apple-touch-icon-argus-brand-20261123.png /var/www/html/public/apple-touch-icon.png \
 && cp /var/www/html/public/apple-touch-icon-argus-brand-20261123.png /var/www/html/public/static/assets/argus-icon-180.png \
 && cp /var/www/html/public/static/assets/argus-brand-home-192-v7.png /var/www/html/public/static/assets/argus-icon-192.png \
 && cp /var/www/html/public/static/assets/argus-brand-home-512-v7.png /var/www/html/public/static/assets/argus-icon-512.png \
 && cp /var/www/html/public/static/assets/argus-brand-home-32-v7.png /var/www/html/public/static/assets/favicon.png \
 && test "$(identify -format '%[opaque]' /var/www/html/public/apple-touch-icon-argus-brand-20261123.png)" = "true" \
 && test "$(identify -format '%[opaque]' /var/www/html/public/static/assets/argus-brand-home-512-v7.png)" = "true"
COPY deployment/argus_home_icon_patch.php /tmp/argus_home_icon_patch.php
COPY deployment/argus_home_icon_test.php /var/www/html/tests/argus_home_icon_test.php
RUN php -l /tmp/argus_home_icon_patch.php \
 && php /tmp/argus_home_icon_patch.php \
 && php -l /var/www/html/tests/argus_home_icon_test.php \
 && php /var/www/html/tests/argus_home_icon_test.php \
 && php /var/www/html/tests/security_regression_test.php


# Critical PWA isolation: /admin previously loaded the seller /conta manifest,
# so Safari/Chrome home icons for Admin launched the reseller account instead.
# Distinct IDs/start_url/scope; route-specific installation guides. UI/GET only.
COPY deployment/argus_pwa_split_patch.php /tmp/argus_pwa_split_patch.php
COPY deployment/argus_pwa_split_test.php /var/www/html/tests/argus_pwa_split_test.php
RUN php -l /tmp/argus_pwa_split_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_pwa_split_patch.php \
 && php -l /var/www/html/src/Gateway.php \
 && php -l /var/www/html/tests/argus_pwa_split_test.php \
 && php /var/www/html/tests/argus_pwa_split_test.php \
 && php /var/www/html/tests/security_regression_test.php


# Push delivery fix: Minishlink WebPush requires an installed PSR-18 HTTP
# adapter; previous test endpoint returned 200 despite HTTP discovery failure.
# Guzzle is now an explicit Composer dependency. Separate service worker scopes
# let admin and reseller coexist on the same device without replacing a Push
# subscription from the other panel. No payments, balances or PSP calls in build.
COPY deployment/sw-admin.js /var/www/html/public/sw-admin.js
COPY deployment/sw-revenda.js /var/www/html/public/sw-revenda.js
COPY deployment/argus_push_delivery_patch.php /tmp/argus_push_delivery_patch.php
COPY deployment/argus_push_delivery_test.php /var/www/html/tests/argus_push_delivery_test.php
RUN php -l /var/www/html/src/Notifications.php \
 && php -l /tmp/argus_push_delivery_patch.php \
 && php -d display_errors=1 -d log_errors=1 -d error_log=/dev/stderr /tmp/argus_push_delivery_patch.php \
 && php -l /var/www/html/tests/argus_push_delivery_test.php \
 && php /var/www/html/tests/argus_push_delivery_test.php \
 && php /var/www/html/tests/notifications_test.php \
 && php /var/www/html/tests/security_regression_test.php


# Device-specific notification toggle for both installed PWA panels.
# Checks real browser permission, exact local subscription, and its ownership
# on the server before showing "Ativas". No money flows or test Push sent.
COPY deployment/notifications-toggle.css /var/www/html/public/static/notifications-toggle.css
COPY deployment/argus_push_toggle_patch.php /tmp/argus_push_toggle_patch.php
COPY deployment/argus_push_toggle_test.php /var/www/html/tests/argus_push_toggle_test.php
RUN php -l /var/www/html/src/Notifications.php \
 && php -l /tmp/argus_push_toggle_patch.php \
 && php /tmp/argus_push_toggle_patch.php \
 && php -l /var/www/html/tests/argus_push_toggle_test.php \
 && php /var/www/html/tests/argus_push_toggle_test.php \
 && php /var/www/html/tests/security_regression_test.php
