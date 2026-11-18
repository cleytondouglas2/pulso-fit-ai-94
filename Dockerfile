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
RUN php tests/shared_pgsql_unit.php && php tests/b2b_unit.php && php tests/live_pix_unit.php && php tests/b2b_http.php
ENV ARGUS_DB_DRIVER=sqlite ARGUS_COOKIE_SECURE=true ARGUS_MISTICPAY_MODE=disabled
EXPOSE 10000
CMD ["/bin/bash", "-c", "php /usr/local/share/argus/storage_probe.php; exec /bin/bash /var/www/html/start-render.sh"]
