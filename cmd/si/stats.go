package main

import (
	"encoding/json"
	"fmt"
)

func cmdProjects(args []string) {
	apiURL, projectID, token, _, _ := parseGlobalFlags(args)
	requireConfig(projectID, token)

	client := NewAPIClient(apiURL, projectID, token)

	var data DashboardData
	if err := client.get("/dashboard/data", &data); err != nil {
		if e, ok := err.(*SIError); ok {
			fail(e.Code, e)
		}
		fail(100, &SIError{Code: 100, Type: "api_error", Message: err.Error()})
	}

	if jsonOutput {
		printJSON(map[string]interface{}{
			"id":   projectID,
			"url":  apiURL,
			"name": "SuperInsights Project",
		})
	} else {
		printText([]string{
			fmt.Sprintf("Project ID: %s", projectID),
			fmt.Sprintf("API URL:    %s", apiURL),
		})
	}
}

type DashboardData struct {
	Timeframe   string      `json:"timeframe"`
	PageViews   interface{} `json:"pageViews"`
	Events      interface{} `json:"events"`
	Errors      interface{} `json:"errors"`
	Performance interface{} `json:"performance"`
}

func cmdStats(args []string) {
	apiURL, projectID, token, timeframe, _ := parseGlobalFlags(args)
	requireConfig(projectID, token)

	client := NewAPIClient(apiURL, projectID, token)

	var pv interface{}
	client.get(fmt.Sprintf("/pageviews?timeframe=%s", timeframe), &pv)

	var ev interface{}
	client.get(fmt.Sprintf("/events?timeframe=%s", timeframe), &ev)

	var er interface{}
	client.get(fmt.Sprintf("/errors?timeframe=%s", timeframe), &er)

	stats := map[string]interface{}{
		"timeframe":   timeframe,
		"pageviews":   pv,
		"events":      ev,
		"errors":      er,
		"performance": "see si pageviews, si events, si errors for details",
	}

	if jsonOutput {
		printJSON(stats)
	} else {
		lines := []string{
			fmt.Sprintf("Stats (timeframe: %s)", timeframe),
			"",
			fmt.Sprintf("  Pageviews:   %s", describe(pv)),
			fmt.Sprintf("  Events:      %s", describe(ev)),
			fmt.Sprintf("  Errors:      %s", describe(er)),
		}
		printText(lines)
	}
}

func describe(v interface{}) string {
	if v == nil {
		return "no data"
	}
	b, _ := json.Marshal(v)
	s := string(b)
	if len(s) > 120 {
		s = s[:120] + "..."
	}
	return s
}
