FROM php:8.3-cli-alpine
RUN apk add --no-cache unzip sqlite-dev && docker-php-ext-install pdo_sqlite
WORKDIR /app
COPY source.zip /tmp/argus-source.zip
RUN unzip -q /tmp/argus-source.zip -d /tmp/ \
 && cp -a /tmp/argus_payments_php/. /app/ \
 && rm -rf /tmp/argus_payments_php /tmp/argus-source.zip \
 && mkdir -p /app/storage \
 && chmod 0777 /app/storage
ENV ARGUS_DB_DRIVER=sqlite ARGUS_COOKIE_SECURE=true
EXPOSE 10000
CMD ["sh","-c","php -d auto_prepend_file=/app/demo_guard.php -S 0.0.0.0:${PORT:-10000} -t public public/router.php"]
