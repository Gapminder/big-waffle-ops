# Use an official NodeJS runtime as a parent image
FROM node:10-alpine as builder

## Install build toolchain, install node deps and compile native add-ons
RUN apk add --no-cache --virtual .gyp python make g++
COPY service/package.json ./
RUN npm install --production

FROM node:alpine as app

RUN apk add --no-cache libc6-compat

# Create service directory
WORKDIR /usr/bwops/service

## Copy built node modules and binaries without including the toolchain
COPY --from=builder node_modules ./node_modules

# Bundle service source
COPY service ./

# Make port 8888 available to the world outside this container
EXPOSE 8888

# Define environment variable
ENV BW_OPS_PORT=8888

CMD [ "node", "index.js"]