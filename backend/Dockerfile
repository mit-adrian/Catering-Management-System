FROM php:8.3-cli

RUN apt-get update && apt-get install -y \
    git unzip libzip-dev libpng-dev libjpeg-dev libonig-dev libxml2-dev \
 && docker-php-ext-configure gd --with-jpeg \
 && docker-php-ext-install pdo_mysql mbstring zip gd bcmath exif

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
COPY . .
RUN composer install --no-dev --optimize-autoloader --no-interaction \
 && chmod -R 775 storage bootstrap/cache

CMD php artisan storage:link || true; php artisan config:cache && php artisan migrate --force && php artisan serve --host=0.0.0.0 --port=${PORT:-10000}