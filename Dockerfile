# syntax = docker/dockerfile:1.0-experimental

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

# Update & upgrade
RUN apk update && \
    apk upgrade

# Copy across the files from our `intermediate` container
RUN mkdir -p /root/docker/

# Copy from git
WORKDIR /root/docker/
COPY --from=intermediate /root/docker/** ./
WORKDIR /root/docker/discord-activity-monitor/

# Install packages
RUN npm install
RUN npm install -g npm

# Make auth.ts
RUN --mount=type=secret,id=auth.ts,required cat /run/secrets/auth.ts > ./auth.ts

CMD ["npm", "start"]