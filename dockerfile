# Choose and name our temporary image.
FROM alpine as intermediate

LABEL stage=intermediate

RUN apk update && \
    apk add --update git

RUN mkdir -p /root/docker/
WORKDIR /root/docker/
RUN git clone https://github.com/kylemiller3/discord-activity-monitor.git

# Choose the base image for our final image
FROM alpine:latest
FROM node:lts-alpine

ARG DISCORD_KEY
ARG POSTGRES_PASSWORD
ARG POSTGRES_HOST
ARG POSTGRES_PORT

# Update & upgrade
RUN apk update && \
    apk upgrade

# Copy across the files from our `intermediate` container
RUN mkdir -p /root/docker/bond/

# Copy from git
WORKDIR /root/docker/bond/
COPY --from=intermediate /root/docker/** ./

# Install packages
RUN npm install
RUN npm install -g npm

# Make auth.ts
RUN echo "export const discordKey = '${DISCORD_KEY}';" > auth.ts && \
    echo "export const dbPassword = '${POSTGRES_PASSWORD}';" >> auth.ts && \
    echo "export const dbHost = '${POSTGRES_HOST}';" >> auth.ts && \
    echo "export const dbPort = '${POSTGRES_PORT}';" >> auth.ts && \
    echo "" >> auth.ts && \
    cat auth.ts

CMD ["npm", "start"]