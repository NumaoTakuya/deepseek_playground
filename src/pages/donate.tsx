import React from "react";
import {
  Box,
  Typography,
  Button,
  Container,
  Card,
  CardContent,
  Grid,
} from "@mui/material";

export default function DonatePage() {
  return (
    <Box
      sx={{
        fontFamily: "Inter, sans-serif",
        backgroundColor: "#1F2023",
        color: "#ECECF1",
        minHeight: "100vh",
      }}
    >
      {/* Hero-ish Top Section */}
      <Box
        sx={{
          position: "relative",
          // スマホは少し小さめに、PCではそのまま
          height: { xs: "25vh", sm: "30vh" },
          background: `url("/images/donate-bg.jpeg") center/cover no-repeat`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Overlay */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        />
        <Container
          sx={{
            position: "relative",
            textAlign: "center",
            zIndex: 1,
            color: "#fff",
            px: 2,
          }}
        >
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              mb: 2,
              fontSize: { xs: "1.8rem", sm: "2.125rem" },
            }}
          >
            Support Our Unofficial Project
          </Typography>
          <Typography
            variant="body1"
            sx={{
              maxWidth: 600,
              mx: "auto",
              opacity: 0.9,
              fontSize: { xs: "0.9rem", sm: "1rem" },
            }}
          >
            This project is non-profit and open-source. Your donation helps
            cover server costs and keeps our Deepseek Playground running freely
            for everyone.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: { xs: 4, sm: 8 } }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            mb: { xs: 2, sm: 4 },
            textAlign: "center",
            fontSize: { xs: "1.8rem", sm: "2rem" },
          }}
        >
          Donate &amp; Help Us Grow
        </Typography>

        <Grid container spacing={4} justifyContent="center">
          {/* Donation Card Example */}
          <Grid item xs={12} sm={6} md={4}>
            <Card sx={{ backgroundColor: "#2A2B32", height: "100%" }}>
              <CardContent>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
                  Small Support
                </Typography>
                <Typography
                  variant="body2"
                  color="#bfbfbf"
                  sx={{ mb: 3, fontSize: { xs: "0.9rem", sm: "1rem" } }}
                >
                  Contribute <strong>$1</strong> to help with basic server
                  maintenance.
                </Typography>
                <Button
                  variant="contained"
                  href="https://www.paypal.com/ncp/payment/SRMTLNZLNUEFU"
                  sx={{
                    backgroundColor: "#00B8D9",
                    "&:hover": { backgroundColor: "#00A0BD" },
                    textTransform: "none",
                    fontWeight: 600,
                  }}
                >
                  Donate $1
                </Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Card sx={{ backgroundColor: "#2A2B32", height: "100%" }}>
              <CardContent>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
                  Steady Boost
                </Typography>
                <Typography
                  variant="body2"
                  color="#bfbfbf"
                  sx={{ mb: 3, fontSize: { xs: "0.9rem", sm: "1rem" } }}
                >
                  Contribute <strong>$10</strong> to cover a decent chunk of
                  monthly costs.
                </Typography>
                <Button
                  variant="contained"
                  href="https://www.paypal.com/ncp/payment/T73673Y233KJA"
                  sx={{
                    backgroundColor: "#00B8D9",
                    "&:hover": { backgroundColor: "#00A0BD" },
                    textTransform: "none",
                    fontWeight: 600,
                  }}
                >
                  Donate $10
                </Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Card sx={{ backgroundColor: "#2A2B32", height: "100%" }}>
              <CardContent>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
                  Major Contribution
                </Typography>
                <Typography
                  variant="body2"
                  color="#bfbfbf"
                  sx={{ mb: 3, fontSize: { xs: "0.9rem", sm: "1rem" } }}
                >
                  Contribute <strong>$100</strong> or more to significantly
                  support our hosting and development efforts.
                </Typography>
                <Button
                  variant="contained"
                  href="https://www.paypal.com/ncp/payment/HNK492TAZG8XL"
                  sx={{
                    backgroundColor: "#00B8D9",
                    "&:hover": { backgroundColor: "#00A0BD" },
                    textTransform: "none",
                    fontWeight: 600,
                  }}
                >
                  Donate $100
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Additional Explanation */}
        <Box sx={{ mt: { xs: 4, sm: 6 }, textAlign: "center" }}>
          <Typography
            variant="body1"
            color="#bfbfbf"
            sx={{
              maxWidth: 600,
              mx: "auto",
              mb: 2,
              fontSize: { xs: "0.9rem", sm: "1rem" },
            }}
          >
            Your donation is completely voluntary. We appreciate any
            contribution, no matter how small. By supporting this unofficial,
            open-source project, you help us maintain and improve the service
            for everyone who wants to explore AI capabilities using Deepseek.
          </Typography>
          <Typography
            variant="body1"
            color="#bfbfbf"
            sx={{
              maxWidth: 600,
              mx: "auto",
              fontSize: { xs: "0.9rem", sm: "1rem" },
            }}
          >
            Thank you for being part of our community!
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
