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
RUN php -l src/Integrations/MisticPayFinance.php && php -l src/Security2FA.php && php -l src/Integrations/MisticPayPayout.php && php -l src/Admin.php && php -l src/Gateway.php && php -l src/LivePix.php && php tests/finance_qr_unit.php && php tests/security_2fa_unit.php && php tests/shared_pgsql_unit.php && php tests/b2b_unit.php && php tests/live_pix_unit.php && php tests/admin_http.php && php tests/ui_contract.php
ENV ARGUS_DB_DRIVER=sqlite ARGUS_COOKIE_SECURE=true ARGUS_MISTICPAY_MODE=disabled
EXPOSE 10000
CMD ["/bin/bash", "-c", "php /usr/local/share/argus/storage_probe.php; exec /bin/bash /var/www/html/start-render.sh"]
