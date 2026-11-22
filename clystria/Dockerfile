FROM php:8.3-apache
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev libcurl4-openssl-dev libsqlite3-dev \
    && docker-php-ext-install -j2 pdo_pgsql pdo_sqlite curl \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /var/www/html
COPY public/ /var/www/html/public/
COPY src/ /var/www/html/src/
COPY start.sh /usr/local/bin/clystria-start
RUN chmod +x /usr/local/bin/clystria-start \
    && chown -R www-data:www-data /var/www/html \
    && sed -ri 's!DocumentRoot /var/www/html!DocumentRoot /var/www/html/public!g' /etc/apache2/sites-available/000-default.conf
ENV APP_ENV=production
EXPOSE 10000
CMD ["clystria-start"]
